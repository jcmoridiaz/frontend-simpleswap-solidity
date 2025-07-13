// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev SimpleSwap inherits ERC20 to mint LP tokens (SSLP)
contract SimpleSwap is ERC20 {
/// @notice Token A address in the pair
address public immutable TokenA;
/// @notice Token B address in the pair
address public immutable TokenB;

/// @notice Current reserve of token A in contract
uint256 private reserveA;
/// @notice Current reserve of token B in contract
uint256 private reserveB;
/// @notice Tracks LP token balances per provider (mirror of ERC20 balances)
mapping(address => uint256) private liquidityBalance;

/// @notice Emitted when liquidity is added
/// @param provider Address adding liquidity
/// @param TokenA Address of token A
/// @param TokenB Address of token B
/// @param amountA Amount of token A added
/// @param amountB Amount of token B added
/// @param liquidity Amount of LP tokens minted
event LiquidityAdded(
    address indexed provider,
    address TokenA,
    address TokenB,
    uint256 amountA,
    uint256 amountB,
    uint256 liquidity
);

/// @notice Emitted when liquidity is removed
event LiquidityRemoved(
    address indexed provider,
    address TokenA,
    address TokenB,
    uint256 amountA,
    uint256 amountB,
    uint256 liquidity
);

/// @notice Emitted when a token swap is executed
/// @param sender Address performing the swap
/// @param amountIn Amount of input token
/// @param amountOut Amount of output token
/// @param to Recipient of output token
event SwapExecuted(
    address indexed sender,
    uint256 amountIn,
    uint256 amountOut,
    address indexed to
);

/**
 * @param tokenA Address of first token in pair
 * @param tokenB Address of second token in pair
 */
constructor(address tokenA, address tokenB) ERC20("SimpleSwap LP Token", "SSLP") {
    require(tokenA != tokenB, "IDENTICAL_ADDRESSES");
    require(tokenA != address(0) && tokenB != address(0), "ZERO_ADDRESS");
    TokenA = tokenA;
    TokenB = tokenB;
}

/**
 * @dev Ensures deadline is not passed
 * @param deadline Unix timestamp after which call is invalid
 */
modifier ensure(uint256 deadline) {
    require(deadline >= block.timestamp, "EXPIRED");
    _;
}

/// @dev Synchronizes reserves with on-chain token balances
function _updateReserves() private {
    reserveA = IERC20(TokenA).balanceOf(address(this));
    reserveB = IERC20(TokenB).balanceOf(address(this));
}

/**
 * @notice Adds liquidity to the pool
 * @param tokenA Must match pair TokenA
 * @param tokenB Must match pair TokenB
 * @param amountADesired Desired amount of TokenA to deposit
 * @param amountBDesired Desired amount of TokenB to deposit
 * @param amountAMin Minimum acceptable TokenA to avoid front-running
 * @param amountBMin Minimum acceptable TokenB to avoid front-running
 * @param to Recipient of LP tokens
 * @param deadline Unix timestamp by which the tx must be mined
 * @return amountA Actual TokenA deposited
 * @return amountB Actual TokenB deposited
 * @return liquidity Amount of LP tokens minted
 */
function addLiquidity(
    address tokenA,
    address tokenB,
    uint256 amountADesired,
    uint256 amountBDesired,
    uint256 amountAMin,
    uint256 amountBMin,
    address to,
    uint256 deadline
) external ensure(deadline) returns (
    uint256 amountA,
    uint256 amountB,
    uint256 liquidity
) {
    // Validate correct token pair
    require(tokenA == TokenA && tokenB == TokenB, "INVALID_TOKEN_PAIR");
    require(to != address(0), "INVALID_RECIPIENT");

    uint256 _rA = reserveA;
    uint256 _rB = reserveB;
		
    // Calculate optimal deposit amounts
    if (totalSupply() == 0) {
        amountA = amountADesired;
        amountB = amountBDesired;
    } else {
        uint256 amountBOptimal = (amountADesired * _rB) / _rA;
        if (amountBOptimal <= amountBDesired) {
            require(amountBOptimal >= amountBMin, "INSUFFICIENT_B_AMOUNT");
            (amountA, amountB) = (amountADesired, amountBOptimal);
        } else {
            uint256 amountAOptimal = (amountBDesired * _rA) / _rB;
            require(amountAOptimal >= amountAMin, "INSUFFICIENT_A_AMOUNT");
            (amountA, amountB) = (amountAOptimal, amountBDesired);
        }
    }

    // Transfer tokens from provider to pool
    require(
        IERC20(TokenA).transferFrom(msg.sender, address(this), amountA),
        "TRANSFER_FROM_A_FAILED"
    );
    require(
        IERC20(TokenB).transferFrom(msg.sender, address(this), amountB),
        "TRANSFER_FROM_B_FAILED"
    );

    // Calculate LP tokens to mint
    if (totalSupply() == 0) {
        liquidity = _sqrt(amountA * amountB);
    } else {
        uint256 liqA = (amountA * totalSupply()) / _rA;
        uint256 liqB = (amountB * totalSupply()) / _rB;
        liquidity = liqA < liqB ? liqA : liqB;
    }
    require(liquidity > 0, "INSUFFICIENT_LIQUIDITY_MINTED");

    // Mint LP tokens and update state
    _mint(to, liquidity);
    liquidityBalance[to] += liquidity;
    _updateReserves();

    emit LiquidityAdded(
        to,
        tokenA,
        tokenB,
        amountA,
        amountB,
        liquidity
    );
}


/**
 * @notice Removes liquidity from the pool
 * @param tokenA Must match pair TokenA
 * @param tokenB Must match pair TokenB
 * @param liquidity Amount of LP tokens to burn
 * @param amountAMin Minimum TokenA expected
 * @param amountBMin Minimum TokenB expected
 * @param to Recipient of underlying tokens
 * @param deadline Unix timestamp by which tx must be mined
 * @return amountA TokenA withdrawn
 * @return amountB TokenB withdrawn
 */
function removeLiquidity(
    address tokenA,
    address tokenB,
    uint256 liquidity,
    uint256 amountAMin,
    uint256 amountBMin,
    address to,
    uint256 deadline
) external ensure(deadline) returns (
    uint256 amountA,
    uint256 amountB
) {
    require(tokenA == TokenA && tokenB == TokenB, "INVALID_TOKEN_PAIR");
    require(to != address(0), "INVALID_RECIPIENT");
    require(
        liquidity > 0 && liquidityBalance[msg.sender] >= liquidity,
        "INSUFFICIENT_LIQUIDITY"
    );

    uint256 _totalSupply = totalSupply();
    amountA = (liquidity * reserveA) / _totalSupply;
    amountB = (liquidity * reserveB) / _totalSupply;
    require(
        amountA >= amountAMin && amountB >= amountBMin,
        "INSUFFICIENT_OUTPUT_AMOUNT"
    );

    // Burn LP tokens and update balance
    _burn(msg.sender, liquidity);
    liquidityBalance[msg.sender] -= liquidity;

    // Transfer underlying tokens to provider
    require(
        IERC20(TokenA).transfer(to, amountA),
        "TRANSFER_A_FAILED"
    );
    require(
        IERC20(TokenB).transfer(to, amountB),
        "TRANSFER_B_FAILED"
    );

    _updateReserves();

    emit LiquidityRemoved(
        to,
        tokenA,
        tokenB,
        amountA,
        amountB,
        liquidity
    );
}

/**
 * @notice Swaps exact amount of one token for the other
 * @param amountIn Amount of input token to swap
 * @param amountOutMin Minimum acceptable output amount
 * @param path Exactly two token addresses [input, output]
 * @param to Recipient of output tokens
 * @param deadline Unix timestamp by which tx must be mined
 * @return amounts Array [amountIn, amountOut]
 */
function swapExactTokensForTokens(
    uint256 amountIn,
    uint256 amountOutMin,
    address[] calldata path,
    address to,
    uint256 deadline
) external ensure(deadline) returns (uint256[] memory amounts) {
    require(path.length == 2, "INVALID_PATH");

    // Determine input and output tokens
    address input = path[0] == TokenA ? TokenA : TokenB;
    address output = input == TokenA ? TokenB : TokenA;

    // Compute output amount
    uint256 amountOut = getAmountOut(
        amountIn,
        input == TokenA ? reserveA : reserveB,
        input == TokenA ? reserveB : reserveA
    );
    require(amountOut >= amountOutMin, "INSUFFICIENT_OUTPUT_AMOUNT");

    // Execute swap
    require(
        IERC20(input).transferFrom(msg.sender, address(this), amountIn),
        "TRANSFER_IN_FAILED"
    );
    require(
        IERC20(output).transfer(to, amountOut),
        "TRANSFER_OUT_FAILED"
    );

    _updateReserves();

    amounts = new uint256[](2);
    amounts[0] = amountIn;
    amounts[1] = amountOut;

    emit SwapExecuted(msg.sender, amountIn, amountOut, to);
}

/**
 * @notice Returns price of base token in quote token
 * @param tokenA Base token address
 * @param tokenB Quote token address
 * @return price Price value scaled by 1e18
 */
function getPrice(address tokenA, address tokenB) external view returns (uint256 price) {
    require(
        (tokenA == TokenA && tokenB == TokenB) ||
        (tokenA == TokenB && tokenB == TokenA),
        "INVALID_TOKEN_PAIR"
    );
    price = tokenA == TokenA
        ? (reserveB * 1e18) / reserveA
        : (reserveA * 1e18) / reserveB;
    return price;
}

/**
 * @notice Computes output amount for a given input and reserves (pure)
 * @param amountIn Amount of input tokens
 * @param reserveIn Reserve of input token
 * @param reserveOut Reserve of output token
 * @return amountOut Calculated output amount
 */
function getAmountOut(
    uint256 amountIn,
    uint256 reserveIn,
    uint256 reserveOut
) public pure returns (uint256 amountOut) {
    require(amountIn > 0, "INSUFFICIENT_INPUT_AMOUNT");
    require(reserveIn > 0 && reserveOut > 0, "INSUFFICIENT_LIQUIDITY");

    uint256 numerator = amountIn * reserveOut;
    uint256 denominator = amountIn + reserveIn;
    amountOut = numerator / denominator;
    return amountOut;
}

/**
 * @notice Computes output amount given token addresses (view)
 */
function getAmountOut(
    address tokenIn,
    address tokenOut,
    uint256 amountIn
) internal view returns (uint256) {
    require(
        (tokenIn == TokenA && tokenOut == TokenB) ||
        (tokenIn == TokenB && tokenOut == TokenA),
        "INVALID_TOKEN_PAIR"
    );
    (uint256 rIn, uint256 rOut) = tokenIn == TokenA
        ? (reserveA, reserveB)
        : (reserveB, reserveA);
    return getAmountOut(amountIn, rIn, rOut);
}

/**
 * @notice Babylonian method for square root
 */
function _sqrt(uint256 y) private pure returns (uint256 z) {
    if (y > 3) {
        z = y;
        uint256 x = y / 2 + 1;
        while (x < z) {
            z = x;
            x = (y / x + x) / 2;
        }
    } else if (y != 0) {
        z = 1;
    }
}

}