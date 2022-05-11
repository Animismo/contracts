pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../upgrades/GraphUpgradeable.sol";

import "./ReservoirStorage.sol";
import "./IReservoir.sol";

import "./arbitrum/L1ArbitrumMessenger.sol";

/**
 * @title Rewards Reservoir
 * @dev TODO
 */
contract Reservoir is ReservoirV1Storage, GraphUpgradeable, IReservoir, L1ArbitrumMessenger {
  using SafeMath for uint256;

  uint256 private constant TOKEN_DECIMALS = 1e18;
  uint256 private constant MIN_ISSUANCE_RATE = 1e18;
  uint256 private constant MINT_SUPPLY_PERIOD = 45815; // ~1 week in blocks

  function drip(uint256 l2MaxGas, uint256 l2GasPriceBid, uint256 l2MaxSubmissionCost) external payable {
    uint256 mintedRewardsTotal = deltaRewards(rewardsMintedUntilBlock, lastRewardsUpdateBlock);
    uint256 mintedRewardsActual = deltaRewards(block.number, lastRewardsUpdateBlock);
    // eps = (signed int) mintedRewardsTotal - mintedRewardsActual

    lastRewardsUpdateBlock = block.number;
    rewardsMintedUntilBlock = block.number.add(MINT_SUPPLY_PERIOD);
    // n:
    uint256 newRewardsToDistribute = deltaRewards(rewardsMintedUntilBlock, lastRewardsUpdateBlock);
    // N = n - eps
    uint256 tokensToMint = newRewardsToDistribute.add(mintedRewardsActual).sub(mintedRewardsTotal);

    if (tokensToMint > 0) {
      graphToken().mint(address(this), tokensToMint);
    }
    accumulatedGlobalRewards = accumulatedGlobalRewards.add(mintedRewardsActual);
    uint256 newL2Rewards = l2RewardsFraction.mul(mintedRewardsActual).div(TOKEN_DECIMALS);
    accumulatedLayerRewards = accumulatedLayerRewards.add(mintedRewardsActual).sub(newL2Rewards);

    tokenSupplyCache = graphToken().totalSupply();

    uint256 tokensToSendToL2 = l2RewardsFraction.mul(newRewardsToDistribute).div(TOKEN_DECIMALS);
    if (l2RewardsFraction != lastL2RewardsFraction) {
      if (mintedRewardsTotal > mintedRewardsActual) { // eps > 0, i.e. t < t1_old
        tokensToSendToL2 = tokensToSendToL2.sub(lastL2RewardsFraction.mul(mintedRewardsTotal.sub(mintedRewardsActual)));
      } else {
        tokensToSendToL2 = tokensToSendToL2.add(lastL2RewardsFraction.mul(mintedRewardsActual.sub(mintedRewardsTotal)));
      }
      lastL2RewardsFraction = l2RewardsFraction;
    }
    _sendNewTokensAndStateToL2(tokensToSendToL2, l2MaxSubmissionCost, l2GasPriceBid, l2MaxGas);
  }

  function _sendNewTokensAndStateToL2(uint256 nTokens, uint256 maxGas, uint256 gasPriceBid, uint256 maxSubmissionCost) internal payable {
    uint256 normalizedSupply = l2RewardsFraction * tokenSupplyCache;
    bytes memory extraData = abi.encode(normalizedSupply);
    bytes memory data = abi.encode(maxSubmissionCost, extraData);
    ITokenGateway gateway = ITokenGateway(_resolveContract(keccak256("GraphTokenGateway")));
    gateway.outboundTransfer{value: msg.value}(
      address(graphToken()),
      l2ReservoirAddress,
      nTokens,
      maxGas,
      gasPriceBid,
      data
    );
  }

  function deltaRewards(uint256 t1, uint256 t0) public returns (uint256) {
    if (issuanceRate <= MIN_ISSUANCE_RATE) {
        return 0;
    }
    return tokenSupplyCache.mul(_pow(issuanceRate, t1.sub(t0), TOKEN_DECIMALS)).div(TOKEN_DECIMALS);
  }

  /**
     * @dev Raises x to the power of n with scaling factor of base.
     * Based on: https://github.com/makerdao/dss/blob/master/src/pot.sol#L81
     * @param x Base of the exponentiation
     * @param n Exponent
     * @param base Scaling factor
     * @return z Exponential of n with base x
     */
    function _pow(
        uint256 x,
        uint256 n,
        uint256 base
    ) private pure returns (uint256 z) {
        assembly {
            switch x
            case 0 {
                switch n
                case 0 {
                    z := base
                }
                default {
                    z := 0
                }
            }
            default {
                switch mod(n, 2)
                case 0 {
                    z := base
                }
                default {
                    z := x
                }
                let half := div(base, 2) // for rounding.
                for {
                    n := div(n, 2)
                } n {
                    n := div(n, 2)
                } {
                    let xx := mul(x, x)
                    if iszero(eq(div(xx, x), x)) {
                        revert(0, 0)
                    }
                    let xxRound := add(xx, half)
                    if lt(xxRound, xx) {
                        revert(0, 0)
                    }
                    x := div(xxRound, base)
                    if mod(n, 2) {
                        let zx := mul(z, x)
                        if and(iszero(iszero(x)), iszero(eq(div(zx, x), z))) {
                            revert(0, 0)
                        }
                        let zxRound := add(zx, half)
                        if lt(zxRound, zx) {
                            revert(0, 0)
                        }
                        z := div(zxRound, base)
                    }
                }
            }
        }
    }
}
