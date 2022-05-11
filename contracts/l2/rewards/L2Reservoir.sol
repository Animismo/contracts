// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../../arbitrum/L2ArbitrumMessenger.sol";

import "../../reservoir/IReservoir.sol";
import "./L2ReservoirStorage.sol";

/**
 * @title L2 Rewards Reservoir
 * @dev TODO
 */
contract L2Reservoir is L2ReservoirV1Storage, GraphUpgradeable, IReservoir, L2ArbitrumMessenger {
  function receiveDrip(uint256 normalizedTokenSupply) external onlyL2Gateway {

  }
}
