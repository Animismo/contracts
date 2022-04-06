import { JsonRpcProvider } from '@ethersproject/providers'
import { Contract, Wallet, providers, Signer } from 'ethers'

import { loadArtifact } from './artifacts'

const l2ChainIds = [42161, 421611]

export const nodeInterfaceAddress = '0x00000000000000000000000000000000000000C8'
export const arbRetryableTxAddress = '0x000000000000000000000000000000000000006E'

export const contractAt = (
  contractName: string,
  contractAddress: string,
  wallet: Wallet,
): Contract => {
  return new Contract(contractAddress, loadArtifact(contractName).abi, wallet.provider)
}

export const getProvider = (providerUrl: string, network?: number): providers.JsonRpcProvider =>
  new providers.JsonRpcProvider(providerUrl, network)

export const chainIdIsL2 = (chainId: number | string) => {
  return l2ChainIds.includes(Number(chainId))
}

export const providerNetworkIsL2 = (signerOrProvider: Signer | providers.Provider) => {
  let chainId: number
  if (signerOrProvider instanceof Signer) {
    chainId =  ((signerOrProvider as Signer).provider as JsonRpcProvider).network.chainId
  } else {
    chainId = (signerOrProvider as JsonRpcProvider).network.chainId
  }
  return chainIdIsL2(chainId)
}
