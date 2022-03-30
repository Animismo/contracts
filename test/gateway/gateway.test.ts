import { expect } from 'chai'
import { constants, utils } from 'ethers'

import { GraphToken } from '../../build/types/GraphToken'
import { BridgeMock } from '../../build/types/BridgeMock'
import { InboxMock } from '../../build/types/InboxMock'
import { OutboxMock } from '../../build/types/OutboxMock'
import { L1GraphTokenGateway } from '../../build/types/L1GraphTokenGateway'

import { NetworkFixture } from '../lib/fixtures'
import { deployContract } from '../lib/deployment'

import {
  advanceBlockTo,
  deriveChannelKey,
  getAccounts,
  randomHexBytes,
  latestBlock,
  toBN,
  toGRT,
  provider,
  Account,
} from '../lib/testHelpers'

const { AddressZero, MaxUint256 } = constants

describe('L1GraphTokenGateway', () => {
  let me: Account
  let governor: Account
  let tokenSender: Account
  let l2Receiver: Account
  let mockRouter: Account
  let mockL2GRT: Account
  let mockL2Router: Account
  let fixture: NetworkFixture

  let grt: GraphToken
  let l1GraphTokenGateway: L1GraphTokenGateway
  let bridgeMock: BridgeMock
  let inboxMock: InboxMock
  let outboxMock: OutboxMock

  const senderTokens = toGRT('1000')
  const maxGas = toBN('1000000')
  const maxSubmissionCost = toBN('7');
  const gasPriceBid = toBN('2');
  const defaultEthValue = maxSubmissionCost.add(maxGas.mul(gasPriceBid));
  const emptyCallHookData = '0x';
  const defaultData = utils.defaultAbiCoder.encode(
      ['uint256', 'bytes'],
      [maxSubmissionCost, emptyCallHookData],
  );
  const notEmptyCallHookData = '0x12';
  const defaultDataWithNotEmptyCallHookData =
    utils.defaultAbiCoder.encode(
        ['uint256', 'bytes'],
        [maxSubmissionCost, notEmptyCallHookData],
    );

  before(async function () {
    ;[me, governor, tokenSender, l2Receiver, mockRouter, mockL2GRT, mockL2Router] = await getAccounts()

    fixture = new NetworkFixture()
    ;({ grt, l1GraphTokenGateway } = await fixture.load(governor.signer))

    // Give some funds to the indexer and approve staking contract to use funds on indexer behalf
    await grt.connect(governor.signer).mint(tokenSender.address, senderTokens)
    //await grt.connect(indexer.signer).approve(staking.address, indexerTokens)
    bridgeMock = (await deployContract(
      'BridgeMock',
      governor.signer,
    )) as unknown as BridgeMock
    inboxMock = (await deployContract(
      'InboxMock',
      governor.signer,
    )) as unknown as InboxMock
    outboxMock = (await deployContract(
      'OutboxMock',
      governor.signer,
    )) as unknown as OutboxMock
  })

  beforeEach(async function () {
    await fixture.setUp()
  })

  afterEach(async function () {
    await fixture.tearDown()
  })

  context('> immediately after deploy', function () {
    describe('calculateL2TokenAddress', function () {
      it('should return address zero as it was not set', async function () {
        expect(await l1GraphTokenGateway.calculateL2TokenAddress(grt.address)).eq(AddressZero)
      })
    })

    describe('outboundTransfer', function () {
      it('reverts because it is paused', async function () {
        const tx = l1GraphTokenGateway.connect(tokenSender.signer).outboundTransfer(
          grt.address,
          l2Receiver.address,
          toGRT('10'),
          maxGas,
          gasPriceBid,
          defaultData,
          {
            value: defaultEthValue
          }
        )
        await expect(tx).revertedWith('Paused (contract)')
      })
    })

    describe('finalizeInboundTransfer', function () {
      it('revert because it is paused', async function () {
        const tx = l1GraphTokenGateway.connect(tokenSender.signer).finalizeInboundTransfer(
          grt.address,
          l2Receiver.address,
          tokenSender.address,
          toGRT('10'),
          defaultData
        )
        await expect(tx).revertedWith('Paused (contract)')
      })
    })

    describe('setArbitrumAddresses', function () {
      it('is not callable by addreses that are not the governor', async function () {
        const tx = l1GraphTokenGateway.connect(tokenSender.signer).setArbitrumAddresses(
          inboxMock.address,
          mockRouter.address
        )
        await expect(tx).revertedWith('Caller must be Controller governor')
      })
      it('sets inbox and router address', async function () {
        const tx = l1GraphTokenGateway.connect(governor.signer).setArbitrumAddresses(
          inboxMock.address,
          mockRouter.address
        )
        await expect(tx).emit(l1GraphTokenGateway, 'ArbitrumAddressesSet')
          .withArgs(inboxMock.address, mockRouter.address)
        expect(await l1GraphTokenGateway.l1Router()).eq(mockRouter.address)
        expect(await l1GraphTokenGateway.inbox()).eq(inboxMock.address)
      })
    })

    describe('setL2TokenAddress', function () {
      it('is not callable by addreses that are not the governor', async function () {
        const tx = l1GraphTokenGateway.connect(tokenSender.signer).setL2TokenAddress(
          mockL2GRT.address
        )
        await expect(tx).revertedWith('Caller must be Controller governor')
      })
      it('sets l2GRT', async function () {
        const tx = l1GraphTokenGateway.connect(governor.signer).setL2TokenAddress(
          mockL2GRT.address
        )
        await expect(tx).emit(l1GraphTokenGateway, 'L2TokenAddressSet')
          .withArgs(mockL2GRT.address)
        expect(await l1GraphTokenGateway.l2GRT()).eq(mockL2GRT.address)
      })
    })

    describe('setL2CounterpartAddress', function () {
      it('is not callable by addreses that are not the governor', async function () {
        const tx = l1GraphTokenGateway.connect(tokenSender.signer).setL2CounterpartAddress(
          mockL2Router.address
        )
        await expect(tx).revertedWith('Caller must be Controller governor')
      })
      it('sets L2Counterpart', async function () {
        const tx = l1GraphTokenGateway.connect(governor.signer).setL2CounterpartAddress(
          mockL2Router.address
        )
        await expect(tx).emit(l1GraphTokenGateway, 'L2CounterpartAddressSet')
          .withArgs(mockL2Router.address)
        expect(await l1GraphTokenGateway.l2Counterpart()).eq(mockL2Router.address)
      })
    })
  })

  context('> after configuring and unpausing', function () {
    before(async function () {
      // First configure the Arbitrum bridge mocks
      await bridgeMock.connect(governor.signer).setInbox(inboxMock.address, true)
      await bridgeMock.connect(governor.signer).setOutbox(outboxMock.address, true)
      await inboxMock.connect(governor.signer).setBridge(bridgeMock.address)
      await outboxMock.connect(governor.signer).setBridge(bridgeMock.address)

      // Configure the gateway
      await l1GraphTokenGateway.connect(governor.signer).setArbitrumAddresses(
        inboxMock.address,
        mockRouter.address
      )
      await l1GraphTokenGateway.connect(governor.signer).setL2TokenAddress(
        mockL2GRT.address
      )
      await l1GraphTokenGateway.connect(governor.signer).setL2CounterpartAddress(
        mockL2Router.address
      )
      await l1GraphTokenGateway.connect(governor.signer).setPaused(false)
    })

    describe('calculateL2TokenAddress', function () {
      it('returns the L2 token address', async function () {
        expect(await l1GraphTokenGateway.calculateL2TokenAddress(grt.address)).eq(mockL2GRT.address)
      })
      it('returns the zero address if the input is any other address', async function () {
        expect(await l1GraphTokenGateway.calculateL2TokenAddress(tokenSender.address)).eq(AddressZero)
      })
    })

    describe('outboundTransfer', function () {
      it('reverts when called with the wrong token address', async function () {
        const tx = l1GraphTokenGateway.connect(tokenSender.signer).outboundTransfer(
          tokenSender.address,
          l2Receiver.address,
          toGRT('10'),
          maxGas,
          gasPriceBid,
          defaultData,
          {
            value: defaultEthValue
          }
        )
        await expect(tx).revertedWith('TOKEN_NOT_GRT')
      })
      it('puts tokens in escrow and creates a retryable ticket')
      it('reverts when called with the wrong value')
      it('reverts when the sender does not have enough GRT')
    })

    describe('finalizeInboundTransfer', function () {
      it('reverts when called by an account that is not the bridge', async function () {
        const tx = l1GraphTokenGateway.connect(tokenSender.signer).finalizeInboundTransfer(
          grt.address,
          l2Receiver.address,
          tokenSender.address,
          toGRT('10'),
          defaultData
        )
        await expect(tx).revertedWith('NOT_FROM_BRIDGE')
      })
      it('sends tokens out of escrow')
    })
  })
})
