// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TokenA - ERC20 token with an initial supply of 100,000,000 units
contract TokenA is ERC20 {
    /// @notice Constructor that creates token A and assigns the total supply to the deployer
    constructor() ERC20("Token A", "TKNA") {
        // Initial supply: 100,000,000 * 10^18 (to represent 18 decimal places)
        _mint(msg.sender, 100000000 * 10 ** decimals());
    }
}