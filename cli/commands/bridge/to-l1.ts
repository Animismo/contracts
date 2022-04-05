import { loadEnv, CLIArgs, CLIEnvironment } from '../../env'
import { logger } from '../../logging'
import { getAddressBook } from '../../address-book'
import { sendTransaction } from '../../network'
import { chainIdIsL2 } from '../../utils'

export const startSendToL1 = async (cli: CLIEnvironment, cliArgs: CLIArgs): Promise<void> => {
  logger.info(`>>> Sending tokens to L1 <<<\n`)
  // TODO
}

export const finishSendToL1 = async (cli: CLIEnvironment, cliArgs: CLIArgs): Promise<void> => {
  logger.info(`>>> Finishing transaction sending tokens to L1 <<<\n`)
  // TODO
}

export const startSendToL1Command = {
  command: 'start-send-to-l1 <amount> [recipient]',
  describe: 'Start an L2-to-L1 Graph Token transaction',
  handler: async (argv: CLIArgs): Promise<void> => {
    return startSendToL1(await loadEnv(argv), argv)
  },
}

export const finishSendToL1Command = {
  command: 'finish-send-to-l1 <id>',
  describe: 'Finish an L2-to-L1 Graph Token transaction. L2 dispute period must have completed',
  handler: async (argv: CLIArgs): Promise<void> => {
    return finishSendToL1(await loadEnv(argv), argv)
  },
}
