import { loadEnv, CLIArgs, CLIEnvironment } from '../../env'
import { logger } from '../../logging'
import { getAddressBook } from '../../address-book'
import { getProvider, sendTransaction, toGRT } from '../../network'
import { chainIdIsL2, nodeInterfaceAddress } from '../../utils'
import { loadAddressBookContract } from '../../contracts'
import { L2TransactionReceipt, getL2Network, L2ToL1MessageStatus, L2ToL1MessageWriter } from '@arbitrum/sdk'

const wait = (ms: number): Promise<void> => {
  return new Promise(res => setTimeout(res, ms))
}

const waitUntilOutboxEntryCreatedWithCb = async (msg: L2ToL1MessageWriter, retryDelay: number, callback: Function) => {
  let done: Boolean = false
  while (!done) {
    const status = await msg.status(null)
    if (status == L2ToL1MessageStatus.CONFIRMED) {
      done = true
    } else {
      callback()
      await wait(retryDelay)
    }
  }
}

export const startSendToL1 = async (cli: CLIEnvironment, cliArgs: CLIArgs): Promise<void> => {
  logger.info(`>>> Sending tokens to L1 <<<\n`)
  const l2Provider = getProvider(cliArgs.l2ProviderUrl)
  const l2ChainId = (await l2Provider.getNetwork()).chainId
  if (chainIdIsL2(cli.chainId) || !chainIdIsL2(l2ChainId)) {
    throw new Error('Please use an L1 provider in --provider-url, and an L2 provider in --l2-provider-url')
  }

  const l1GRT = cli.contracts['GraphToken']
  const l1GRTAddress = l1GRT.address
  const amount = toGRT(cliArgs.amount)
  const recipient = cliArgs.recipient ? cliArgs.recipient : cli.wallet.address
  const l2Wallet = cli.wallet.connect(l2Provider)
  const l2AddressBook = getAddressBook(cliArgs.addressBook, l2ChainId.toString())

  const gateway = loadAddressBookContract('L2GraphTokenGateway', l2AddressBook, l2Wallet)
  const l2GRT = loadAddressBookContract('L2GraphToken', l2AddressBook, l2Wallet)

  const l1Gateway = cli.contracts['L1GraphTokenGateway']
  logger.info(`Will send ${cliArgs.amount} GRT to ${recipient}`)
  logger.info(`Using L2 gateway ${gateway.address} and L1 gateway ${l1Gateway.address}`)

  const params = [
    l1GRTAddress,
    recipient,
    amount,
    '0x'
  ]
  logger.info("Approving token transfer")
  await sendTransaction(l2Wallet, l2GRT, 'approve',[gateway.address, amount])
  logger.info("Sending outbound transfer transaction")
  const receipt = await sendTransaction(l2Wallet, gateway, 'outboundTransfer(address,address,uint256,bytes)', params)
  const l2Receipt = new L2TransactionReceipt(receipt)
  const l2ToL1Message = (await l2Receipt.getL2ToL1Messages(cli.wallet, await getL2Network(l2Provider)))[0]

  logger.info(`The transaction generated an outbox message with batch number ${l2ToL1Message.batchNumber}`)
  logger.info(`and index in batch ${l2ToL1Message.indexInBatch}.`)
  logger.info(`After the dispute period is finalized (in ~1 week), you can finalize this by calling`)
  logger.info(`finish-send-to-l1 with the following txhash:`)
  logger.info(l2Receipt.transactionHash)
}

export const finishSendToL1 = async (cli: CLIEnvironment, cliArgs: CLIArgs, wait: Boolean): Promise<void> => {
  logger.info(`>>> Finishing transaction sending tokens to L1 <<<\n`)
  const l2Provider = getProvider(cliArgs.l2ProviderUrl)
  const l2ChainId = (await l2Provider.getNetwork()).chainId
  if (chainIdIsL2(cli.chainId) || !chainIdIsL2(l2ChainId)) {
    throw new Error('Please use an L1 provider in --provider-url, and an L2 provider in --l2-provider-url')
  }

  const receipt = await l2Provider.getTransactionReceipt(cliArgs.txHash)
  const l2Receipt = new L2TransactionReceipt(receipt)
  const l2ToL1Message = (await l2Receipt.getL2ToL1Messages(cli.wallet, await getL2Network(l2Provider)))[0]

  if (wait) {
    const retryDelayMs = cliArgs.retryDelaySeconds ? (cliArgs.retryDelaySeconds * 1000) : 60000
    logger.info("Waiting for outbox entry to be created, this can take a full week...")
    await waitUntilOutboxEntryCreatedWithCb(l2ToL1Message, retryDelayMs, () => {
      logger.info('Still waiting...')
    })
  } else {
    const status = await l2ToL1Message.status(null)
    if (status != L2ToL1MessageStatus.CONFIRMED) {
      throw new Error(`Transaction is not confirmed, status is ${status} when it should be ${L2ToL1MessageStatus.CONFIRMED}. Has the dispute period passed?`)
    }
  }
  logger.info("Getting proof to execute message")
  const proofInfo = await l2ToL1Message.tryGetProof(l2Provider)

  if(await l2ToL1Message.hasExecuted(proofInfo)) {
    throw new Error('Message already executed!')
  }

  logger.info("Executing outbox transaction")
  const tx = await l2ToL1Message.execute(proofInfo)
  const outboxExecuteReceipt = await tx.wait()
  logger.info('Transaction succeeded! tx hash:')
  logger.info(outboxExecuteReceipt.transactionHash)
}

export const startSendToL1Command = {
  command: 'start-send-to-l1 <amount> [recipient]',
  describe: 'Start an L2-to-L1 Graph Token transaction',
  handler: async (argv: CLIArgs): Promise<void> => {
    return startSendToL1(await loadEnv(argv), argv)
  },
}

export const finishSendToL1Command = {
  command: 'finish-send-to-l1 <txHash>',
  describe: 'Finish an L2-to-L1 Graph Token transaction. L2 dispute period must have completed',
  handler: async (argv: CLIArgs): Promise<void> => {
    return finishSendToL1(await loadEnv(argv), argv, false)
  },
}

export const waitFinishSendToL1Command = {
  command: 'wait-finish-send-to-l1 <txHash> [retryDelaySeconds]',
  describe: "Wait for an L2-to-L1 Graph Token transaction's dispute period to complete (which takes about a week), and then finalize it",
  handler: async (argv: CLIArgs): Promise<void> => {
    return finishSendToL1(await loadEnv(argv), argv, true)
  },
}
