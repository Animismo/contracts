import yargs, { Argv } from 'yargs'

import { sendToL2Command } from './to-l2'
import { startSendToL1Command, finishSendToL1Command } from './to-l1'
import { cliOpts } from '../../defaults'

export const bridgeCommand = {
  command: 'bridge',
  describe: 'Graph token bridge actions.',
  builder: (yargs: Argv): yargs.Argv => {
    return yargs.option('-l', cliOpts.l2ProviderUrl)
      .command(sendToL2Command).command(startSendToL1Command).command(finishSendToL1Command)
  },
  handler: (): void => {
    yargs.showHelp()
  },
}
