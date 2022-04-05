import { loadEnv, CLIArgs, CLIEnvironment } from '../../env'
import { logger } from '../../logging'
import { ContractFunction } from 'ethers'
import { getAddressBook } from '../../address-book'


export const configureL1Bridge = async (cli: CLIEnvironment, cliArgs: CLIArgs): Promise<void> => {
  logger.info(`>>> L1 Bridge Configuration <<<\n`)

  const l2AddressBook = getAddressBook(cliArgs.addressBook, cliArgs.l2ChainId)

  // TODO

}

export const configureL2Bridge = async (cli: CLIEnvironment, cliArgs: CLIArgs): Promise<void> => {
  logger.info(`>>> L2 Bridge Configuration <<<\n`)

  const l1AddressBook = getAddressBook(cliArgs.addressBook, cliArgs.l1ChainId)

  // TODO

}
export const configureL1BridgeCommand = {
  command: 'configure-l1-bridge <l2ChainId>',
  describe: 'Configure L1/L2 bridge parameters (L1 side) using the address book',
  handler: async (argv: CLIArgs): Promise<void> => {
    return configureL1Bridge(await loadEnv(argv), argv)
  },
}

export const configureL2BridgeCommand = {
  command: 'configure-l2-bridge <l1ChainId>',
  describe: 'Configure L1/L2 bridge parameters (L2 side) using the address book',
  handler: async (argv: CLIArgs): Promise<void> => {
    return configureL2Bridge(await loadEnv(argv), argv)
  },
}
