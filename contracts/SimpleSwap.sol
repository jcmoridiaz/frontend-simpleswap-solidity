// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title SimpleSwap Liquidity Pool Contract
/// @notice Allows users to add/remove liquidity and swap between TokenA and TokenB
/// @dev Inherits from ERC20 to represent LP tokens (SSLP)
contract SimpleSwap is ERC20 {

    /// @notice Token A address in the pair
    address public immutable TokenA;
    /// @notice Token B address in the pair
    address public immutable TokenB;

    /// @notice This variable stores the address of the contract owner.
    address private owner;
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

    /// @notice Emitted when liquidity is removed from the pool
    /// @param provider Address removing the liquidity
    /// @param TokenA Address of Token A
    /// @param TokenB Address of Token B
    /// @param amountA Amount of Token A withdrawn
    /// @param amountB Amount of Token B withdrawn
    /// @param liquidity Amount of LP tokens burned
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

    /// @notice Initializes the liquidity pool with token pair addresses
    /// @param tokenA Address of Token A
    /// @param tokenB Address of Token B
    constructor(address tokenA, address tokenB) ERC20("SimpleSwap LP Token", "SSLP") {
        require(tokenA != tokenB, "IDENTICAL_ADDR");
        require(tokenA != address(0) && tokenB != address(0), "ZERO_ADDR");
        TokenA = tokenA;
        TokenB = tokenB;
    }

    /// @dev Restricts function access to only the contract owner
    /// @notice Functions using this modifier can only be called by the contract owner
    /// @custom:security Prevents unauthorized access to sensitive functions
    modifier onlyOwner() {
        require(owner == msg.sender, "OWNER_ONLY");
        _;
    }

    /// @notice Ensures that the current timestamp is before the deadline
    /// @param deadline UNIX timestamp representing the transaction deadline
    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "EXPIRED");
        _;
    }

    /// @dev Synchronizes reserves with on-chain token balances
    function _updateReserves() private {
        reserveA = IERC20(TokenA).balanceOf(address(this));
        reserveB = IERC20(TokenB).balanceOf(address(this));
    }

    /// @notice Adds liquidity to the pool and mints LP tokens
    /// @param tokenA Address of token A
    /// @param tokenB Address of token B
    /// @param amountADesired Desired amount of token A
    /// @param amountBDesired Desired amount of token B
    /// @param amountAMin Minimum amount of token A to add
    /// @param amountBMin Minimum amount of token B to add
    /// @param to Recipient of LP tokens
    /// @param deadline Deadline timestamp for transaction
    /// @return amountA Actual amount of token A added
    /// @return amountB Actual amount of token B added
    /// @return liquidity Amount of LP tokens minted
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
        address tA = TokenA;
        address tB = TokenB;
        require(tokenA == tA && tokenB == tB, "IP");
        require(to != address(0), "ZT");

        uint256[6] memory temp;
        temp[0] = reserveA; // rA
        temp[1] = reserveB; // rB
        temp[2] = totalSupply(); // ts
        temp[3] = amountADesired; // aD
        temp[4] = amountBDesired; // bD

        if (temp[2] == 0) {
            amountA = temp[3];
            amountB = temp[4];
        } else {
            uint256 bOpt = (temp[3] * temp[1]) / temp[0];
            if (bOpt <= temp[4]) {
                require(bOpt >= amountBMin, "LB");
                amountA = temp[3];
                amountB = bOpt;
            } else {
                uint256 aOpt = (temp[4] * temp[0]) / temp[1];
                require(aOpt >= amountAMin, "LA");
                amountA = aOpt;
                amountB = temp[4];
            }
        }

        require(IERC20(tA).transferFrom(msg.sender, address(this), amountA), "TF_A");
        require(IERC20(tB).transferFrom(msg.sender, address(this), amountB), "TF_B");

        if (temp[2] == 0) {
            liquidity = _sqrt(amountA * amountB);
        } else {
            uint256 lA = (amountA * temp[2]) / temp[0];
            uint256 lB = (amountB * temp[2]) / temp[1];
            liquidity = lA < lB ? lA : lB;
        }

        require(liquidity > 0, "NL");

        _mint(to, liquidity);
        unchecked {
            liquidityBalance[to] += liquidity;
        }

        _updateReserves();

        emit LiquidityAdded(to, tA, tB, amountA, amountB, liquidity);
    }

    /// @notice Removes liquidity and returns the underlying tokens
    /// @param tokenA Address of token A
    /// @param tokenB Address of token B
    /// @param liquidity Amount of LP tokens to burn
    /// @param amountAMin Minimum amount of token A to receive
    /// @param amountBMin Minimum amount of token B to receive
    /// @param to Recipient address
    /// @param deadline Deadline timestamp for the transaction
    /// @return amountA Amount of token A returned
    /// @return amountB Amount of token B returned
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address _tokenA = TokenA; // solo una lectura
        address _tokenB = TokenB;
        uint256 _reserveA = reserveA;
        uint256 _reserveB = reserveB;

        require(tokenA == _tokenA && tokenB == _tokenB, "IP");
        require(to != address(0), "ZT");

        uint256 userLiquidity = liquidityBalance[msg.sender];
        require(liquidity > 0 && userLiquidity >= liquidity, "LB");

        uint256 _supply = totalSupply();

        amountA = (liquidity * _reserveA) / _supply;
        amountB = (liquidity * _reserveB) / _supply;

        require(amountA >= amountAMin && amountB >= amountBMin, "SL");

        _burn(msg.sender, liquidity);
        unchecked {
            liquidityBalance[msg.sender] = userLiquidity - liquidity;
        }

        require(IERC20(_tokenA).transfer(to, amountA), "TFA");
        require(IERC20(_tokenB).transfer(to, amountB), "TFB");

        _updateReserves();

        uint256 liq = liquidity;
        emit LiquidityRemoved(to, _tokenA, _tokenB, amountA, amountB, liq);
    }


    /// @notice Swaps exact input tokens for output tokens (constant product AMM)
    /// @param amountIn Amount of input tokens
    /// @param amountOutMin Minimum amount of output tokens expected (slippage control)
    /// @param path Array with input and output token addresses [tokenIn, tokenOut]
    /// @param to Recipient of output tokens
    /// @param deadline Transaction must be executed before this timestamp
    /// @return amounts Array [amountIn, amountOut]
    function swapExactTokensForTokens(
    uint256 amountIn,
    uint256 amountOutMin,
    address[] calldata path,
    address to,
    uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        require(path.length == 2, "BP");

        // Leer y procesar todo en bloques compactos
        bool isZeroToOne;
        uint256 amountOut;
        {
            // Leer variables de estado una sola vez
            address token0 = TokenA;
            address token1 = TokenB;
            
            isZeroToOne = path[0] == token0;
            require(isZeroToOne || path[0] == token1, "BI");
            require((isZeroToOne && path[1] == token1) || (!isZeroToOne && path[1] == token0), "BO");

            uint256 rIn = isZeroToOne ? reserveA : reserveB;
            uint256 rOut = isZeroToOne ? reserveB : reserveA;
            amountOut = getAmountOut(amountIn, rIn, rOut);
        }

        require(amountOut >= amountOutMin, "SL");

        // Realizar transferencias sin variables adicionales
        require(IERC20(isZeroToOne ? TokenA : TokenB).transferFrom(msg.sender, address(this), amountIn), "TF");
        require(IERC20(isZeroToOne ? TokenB : TokenA).transfer(to, amountOut), "TF");

        _updateReserves();

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOut;

        emit SwapExecuted(msg.sender, amountIn, amountOut, to);
    }

    // @notice Returns the price of TokenA in terms of TokenB
    /// @param tokenA Address of Token A
    /// @param tokenB Address of Token B
    /// @return price Token A price in Token B, scaled by 1e18
    function getPrice(address tokenA, address tokenB) external view returns (uint256 price) {
        address _tokenA = TokenA;
        address _tokenB = TokenB;
        uint256 rA = reserveA;
        uint256 rB = reserveB;

        require(
            (tokenA == _tokenA && tokenB == _tokenB) ||
            (tokenA == _tokenB && tokenB == _tokenA),
            "INVALID_PAIR"
        );

        price = tokenA == _tokenA
            ? (rB * 1e18) / rA
            : (rA * 1e18) / rB;

        return price;
    }

    /// @notice Calculates token output amount based on input and reserves
    /// @param amountIn Amount of input token
    /// @param reserveIn Input token reserve
    /// @param reserveOut Output token reserve
    /// @return amountOut Calculated output amount
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256 amountOut) {
        require(amountIn > 0, "ZERO_IN");
        require(reserveIn > 0 && reserveOut > 0, "ZERO_RESERVES");

        uint256 numerator = amountIn * reserveOut;
        uint256 denominator = amountIn + reserveIn;
        amountOut = numerator / denominator;
        return amountOut;
    }

    /// @dev Wrapper to calculate amountOut from token addresses
    /// @param tokenIn Input token address
    /// @param tokenOut Output token address
    /// @param amountIn Amount of input token
    /// @return amountOut Calculated output amount
    function getAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal view returns (uint256) {
        address tokenA = TokenA;
        address tokenB = TokenB;
        uint256 rA = reserveA;
        uint256 rB = reserveB;

        require(
            (tokenIn == tokenA && tokenOut == tokenB) ||
            (tokenIn == tokenB && tokenOut == tokenA),
            "INVALID_PAIR"
        );

        (uint256 rIn, uint256 rOut) = tokenIn == tokenA
            ? (rA, rB)
            : (rB, rA);

        return getAmountOut(amountIn, rIn, rOut);
    }

    /// @notice Withdraw Ether accidentally sent
    function withdraw() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }

    /// @dev Computes square root using Babylonian method
    /// @param y Input value
    /// @return z Square root of y
    function _sqrt(uint256 y) private pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
            return z;
        } else if (y != 0) {
            z = 1;
            return z;
        } else {
            z = 0;
            return z;
        }
    }

    /// @notice Accepts plain Ether transfers.
    receive() external payable {}
}