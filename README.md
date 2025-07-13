# SimpleSwap Smart Contract 🔄

## Overview ℹ️
This repository contains the `SimpleSwap` smart contract and test. The contract's functionalities are thoroughly validated through a comprehensive suite of Hardhat unit tests.

## Features ✨

### Contract Deployment 🚀
The deployment tests ensure the `SimpleSwap` contract is initialized correctly:
*   **Correct Token Addresses**: The contract is verified to deploy successfully, associating with the designated Token A and Token B addresses .
*   **Identical Token Reversion**: Deployment is designed to revert, preventing the creation of a pool with two identical token addresses. This specific error is caught with the `IDENTICAL_ADDRESSES` message.

### Liquidity Management 💰

#### `addLiquidity` Function
This function allows users to contribute tokens to the liquidity pool:
*   **Successful Liquidity Addition**: Upon successful execution, liquidity is added, and corresponding LP tokens are minted. A `LiquidityAdded` event is emitted, and the total supply of LP tokens is confirmed to be greater than zero.
*   **Deadline Expiration Revert**: The transaction will revert if the specified `deadline` for adding liquidity has passed, ensuring timely operations. This error is indicated by `EXPIRED`.
*   **Invalid Token Pair Revert**: Attempts to add liquidity for an invalid token pair (e.g., tokens provided in an incorrect order or for unsupported tokens) will revert with an `INVALID_TOKEN_PAIR` error.
*   **Zero Address Recipient Revert**: If the designated recipient for the minted LP tokens is the zero address, the transaction will revert with `INVALID_RECIPIENT`.
*   **Insufficient Token B Amount Revert**: The function will revert with `INSUFFICIENT_B_AMOUNT` if the optimal amount of Token B determined for the transaction is less than the minimum required `amountBMin`.

#### `removeLiquidity` Function
This function enables users to withdraw their contributed liquidity:
*   **Successful Liquidity Removal**: Liquidity can be successfully removed, resulting in the return of tokens to the user and the emission of a `LiquidityRemoved` event.
*   **Invalid Token Pair Revert**: Similar to adding liquidity, providing an invalid token pair during removal will cause the transaction to revert with `INVALID_TOKEN_PAIR`.
*   **Insufficient Liquidity Revert**: If a user attempts to remove more liquidity than is available or owned, the transaction will revert with `INSUFFICIENT_LIQUIDITY`.
*   **Insufficient Output Amount Revert**: The transaction will revert with `INSUFFICIENT_OUTPUT_AMOUNT` if the calculated output tokens (Token A or Token B received) are less than the specified minimum required amount.

### Token Swapping 💱

#### `swapExactTokensForTokens` Function
This function facilitates the exchange of one token for another via the liquidity pool:
*   **Successful Swap Execution**: A successful swap will transfer tokens as intended and emit a `SwapExecuted` event.
*   **Invalid Path Revert**: If the provided token path for the swap is invalid (e.g., too short or incorrect sequence), the transaction will revert with `INVALID_PATH`.
*   **Insufficient Output Revert**: The function will revert with `INSUFFICIENT_OUTPUT_AMOUNT` if the calculated output token amount for the swap falls below the specified minimum acceptable amount.

### View Functions 🔍
The contract provides several read-only functions to query information about the pool:
*   **`getPrice`**: This function returns the current price (ratio) between two specified tokens in the pool, ensuring the returned value is greater than zero.
*   **`getPrice` Invalid Pair Revert**: Querying the price for an invalid or unsupported token pair will cause `getPrice` to revert with `INVALID_TOKEN_PAIR`.
*   **`getAmountOut`**: This function accurately calculates the expected output amount of tokens for a given input amount and current reserves, demonstrating high precision close to expected values.

## Error Codes ⚠️
The `SimpleSwap` contract is designed with robust error handling, providing specific revert messages for various invalid operations. The following table summarizes the error codes encountered during testing:

| Error Code            | Description                                                                     | Function(s)                   |
| :-------------------- | :------------------------------------------------------------------------------ | :---------------------------- |
| `IDENTICAL_ADDRESSES`   | Deployment with identical addresses for Token A and Token B.                  | Contract Deployment           |
| `EXPIRED`               | Transaction deadline has passed.                                                | `addLiquidity`                |
| `INVALID_TOKEN_PAIR`    | An invalid token pair was provided.                                             | `addLiquidity`, `removeLiquidity`, `getPrice` |
| `INVALID_RECIPIENT`     | The recipient address specified is the zero address.                          | `addLiquidity`                |
| `INSUFFICIENT_B_AMOUNT` | Optimal Token B amount is less than the minimum required `amountBMin`.          | `addLiquidity`                |
| `INSUFFICIENT_LIQUIDITY`| Requested liquidity removal exceeds available liquidity.                        | `removeLiquidity`             |
| `INSUFFICIENT_OUTPUT_AMOUNT`| Calculated output amount is less than the specified minimum.                  | `removeLiquidity`, `swapExactTokensForTokens` |
| `INVALID_PATH`          | The token path provided for the swap is invalid (e.g., too short).          | `swapExactTokensForTokens`    |

## Getting Started 🛠️
*General setup instructions for a Hardhat.*

To set up and interact with this project locally:

### Prerequisites
Ensure you have the following installed:
*   [Node.js](https://nodejs.org/en/download/) (v20.19.3 or higher recommended)
*   [npm](https://www.npmjs.com/get-npm) (v10.8.2) 

### Installation
1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd simple-swap-project
    ```
    *(Replace `<repository-url>` with the actual URL of your project repository.)*
2.  **Install dependencies**:
    ```bash
    npm install
    # or
    yarn install
    ```

## Running Tests 🧪
The project includes a comprehensive suite of Hardhat tests to ensure the contract's integrity and functionality [1].

To execute all tests, navigate to the project root directory in your terminal and run:
```bash
npx hardhat test
This command will run the tests defined in SimpleSwapTest2.cjs, covering deployment, liquidity addition and removal, token swapping, and view function