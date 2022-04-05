import { loadEnv, CLIArgs, CLIEnvironment } from '../../env'
import { logger } from '../../logging'
import { getAddressBook } from '../../address-book'
import { getContractAt, getProvider, sendTransaction, toGRT } from '../../network'
import { chainIdIsL2 } from '../../utils'
import { BigNumber, Contract, utils } from 'ethers'
import { loadArtifact } from '../../artifacts'
import { parseEther } from '@ethersproject/units'

const maxSubmissionPriceIncreasePct = 400
const maxGasIncreasePct = 50
const nodeInterfaceAddress = '0x00000000000000000000000000000000000000C8'
const arbRetryableTxAddress = '0x000000000000000000000000000000000000006E'

const percentIncrease = (val: BigNumber, increase: number): BigNumber => {
  return val.add(val.mul(increase).div(100))
}

export const sendToL2 = async (cli: CLIEnvironment, cliArgs: CLIArgs): Promise<void> => {
  logger.info(`>>> Sending tokens to L2 <<<\n`)
  const l2Provider = getProvider(cliArgs.l2ProviderUrl)
  const gateway = cli.contracts['L1GraphTokenGateway']
  const l1GRTAddress = cli.addressBook.getEntry('GraphToken').address
  const amount = toGRT(cliArgs.amount)
  const recipient = cliArgs.recipient ? cliArgs.recipient : cli.wallet.address
  const l2Dest = await gateway.l2Counterpart()

  logger.info(`Will send ${amount} GRT to ${recipient}`)
  logger.info(`Using L1 gateway ${gateway.address} and L2 gateway ${l2Dest}`)
  // See https://github.com/OffchainLabs/arbitrum/blob/master/packages/arb-ts/src/lib/bridge.ts
  const depositCalldata = await gateway.getOutboundCalldata(
    l1GRTAddress,
    cli.wallet.address,
    recipient,
    amount,
    '0x'
  )

  const arbRetryableTx = getContractAt(arbRetryableTxAddress, 'ArbRetryableTx', l2Provider)
  const nodeInterface = getContractAt(nodeInterfaceAddress, 'NodeInterface', l2Provider)

  let maxSubmissionPrice = (await arbRetryableTx.getSubmissionPrice(depositCalldata.length - 2))[0]
  maxSubmissionPrice = percentIncrease(maxSubmissionPrice, maxSubmissionPriceIncreasePct)

  const gasPriceBid = await l2Provider.getGasPrice()
  // Comment from Offchain Labs' implementation:
  // we add a 0.05 ether "deposit" buffer to pay for execution in the gas estimation
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
  maxGas = percentIncrease(maxGas, maxGasIncreasePct)

  const ethValue = maxSubmissionPrice.add(gasPriceBid.mul(maxGas))

  const data = utils.defaultAbiCoder.encode(
    ['uint256', 'bytes'],
    [maxSubmissionPrice, '0x']
  )

  const params = [
    l1GRTAddress,
    amount,
    maxGas,
    gasPriceBid,
    data
  ]
  await sendTransaction(cli.wallet, gateway, 'outboundTransfer', params, { value: ethValue })
}

export const sendToL2Command = {
  command: 'send-to-l2 <amount> [recipient]',
  describe: 'Perform an L1-to-L2 Graph Token transaction',
  handler: async (argv: CLIArgs): Promise<void> => {
    return sendToL2(await loadEnv(argv), argv)
  },
}
