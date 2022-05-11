// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.7.6;

import "../../reservoir/IReservoir.sol";
import "../../governance/Managed.sol";

contract ReservoirV1Storage is Managed {
  uint256 public l2RewardsFraction;
  address public l2ReservoirAddress;
  uint256 public lastRewardsUpdateBlock;
  uint256 public rewardsMintedUntilBlock;
  uint256 public accumulatedGlobalRewards;
  uint256 public accumulatedL1Rewards;
  uint256 public tokenSupplyCache;
}
