import { loadEnv, CLIArgs, CLIEnvironment } from '../../env'
import { logger } from '../../logging'
import { getContractAt, getProvider, sendTransaction, toGRT } from '../../network'
import { BigNumber, Contract, providers, utils } from 'ethers'
import { parseEther } from '@ethersproject/units'
import { L1TransactionReceipt, L1ToL2MessageStatus } from '@arbitrum/sdk'
import { nodeInterfaceAddress, arbRetryableTxAddress, chainIdIsL2 } from '../../utils'

const maxSubmissionPriceIncreasePct = 400
const maxGasIncreasePct = 50

const percentIncrease = (val: BigNumber, increase: number): BigNumber => {
  return val.add(val.mul(increase).div(100))
}

export const sendToL2 = async (cli: CLIEnvironment, cliArgs: CLIArgs): Promise<void> => {
  logger.info(`>>> Sending tokens to L2 <<<\n`)
  const l2Provider = getProvider(cliArgs.l2ProviderUrl)
  const l2ChainId = (await l2Provider.getNetwork()).chainId
  if (chainIdIsL2(cli.chainId) || !chainIdIsL2(l2ChainId)) {
    throw new Error('Please use an L1 provider in --provider-url, and an L2 provider in --l2-provider-url')
  }
  const gateway = cli.contracts['L1GraphTokenGateway']
  const l1GRT = cli.contracts['GraphToken']
  const l1GRTAddress = l1GRT.address
  const amount = toGRT(cliArgs.amount)
  const recipient = cliArgs.recipient ? cliArgs.recipient : cli.wallet.address
  const l2Dest = await gateway.l2Counterpart()

  logger.info(`Will send ${cliArgs.amount} GRT to ${recipient}`)
  logger.info(`Using L1 gateway ${gateway.address} and L2 gateway ${l2Dest}`)
  // See https://github.com/OffchainLabs/arbitrum/blob/master/packages/arb-ts/src/lib/bridge.ts
  const depositCalldata = await gateway.getOutboundCalldata(
    l1GRTAddress,
    cli.wallet.address,
    recipient,
    amount,
    '0x'
  )

  const arbRetryableTx = getContractAt('ArbRetryableTx', arbRetryableTxAddress, l2Provider)
  const nodeInterface = getContractAt('NodeInterface', nodeInterfaceAddress, l2Provider)

  logger.info("Estimating retryable ticket submission cost:")
  let maxSubmissionPrice = (await arbRetryableTx.getSubmissionPrice(depositCalldata.length - 2))[0]
  logger.info(`maxSubmissionPrice: ${maxSubmissionPrice}, but will accept an increase of up to ${maxSubmissionPriceIncreasePct}%`)
  maxSubmissionPrice = percentIncrease(maxSubmissionPrice, maxSubmissionPriceIncreasePct)

  const gasPriceBid = await l2Provider.getGasPrice()
  // Comment from Offchain Labs' implementation:
  // we add a 0.05 ether "deposit" buffer to pay for execution in the gas estimation
  logger.info("Estimating retryable ticket gas:")
  let maxGas = (
    await nodeInterface.estimateRetryableTicket(
      gateway.address,
      parseEther('0.05'),
      l2Dest,
      parseEther('0'),
      maxSubmissionPrice,
      cli.wallet.address,
      cli.wallet.address,
      0,
      gasPriceBid,
      depositCalldata
    )
  )[0]
  logger.info(`maxGas: ${maxGas}, but will accept an increase of up to ${maxGasIncreasePct}%`)
  maxGas = percentIncrease(maxGas, maxGasIncreasePct)

  const ethValue = maxSubmissionPrice.add(gasPriceBid.mul(maxGas))
  logger.info(`tx value: ${ethValue}`)
  const data = utils.defaultAbiCoder.encode(
    ['uint256', 'bytes'],
    [maxSubmissionPrice, '0x']
  )

  const params = [
    l1GRTAddress,
    recipient,
    amount,
    maxGas,
    gasPriceBid,
    data
  ]
  logger.info("Approving token transfer")
  await sendTransaction(cli.wallet, l1GRT, 'approve',[gateway.address, amount])
  logger.info("Sending outbound transfer transaction")
  const receipt = await sendTransaction(cli.wallet, gateway, 'outboundTransfer', params, { value: ethValue })
  const l1Receipt = new L1TransactionReceipt(receipt)
  const l1ToL2Message = await l1Receipt.getL1ToL2Message(l2Provider)

  logger.info("Waiting for message to propagate to L2...")
  const res = await l1ToL2Message.waitForStatus()
  if (res.status === L1ToL2MessageStatus.FUNDS_DEPOSITED_ON_L2) {
    /** Message wasn't auto-redeemed! */
    logger.error("Funds were deposited on L2 but the retryable ticket was not redeemed")
  } else if (res.status === L1ToL2MessageStatus.REDEEMED) {
    /** Message succesfully redeeemed */
    logger.info("Transfer successful")
  } else {
    logger.error(`Unexpected L1ToL2MessageStatus ${res.status}`)
  }
}

export const sendToL2Command = {
  command: 'send-to-l2 <amount> [recipient]',
  describe: 'Perform an L1-to-L2 Graph Token transaction',
  handler: async (argv: CLIArgs): Promise<void> => {
    return sendToL2(await loadEnv(argv), argv)
  },
}
