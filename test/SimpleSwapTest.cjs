const { expect } = require("chai");
const { ethers } = require("hardhat");

// Main test suite for the SimpleSwap contract.
describe("SimpleSwap", function () {
    // Declare variables for the contracts (TokenA, TokenB, SimpleSwap) and accounts (owner, user1)
    // that will be used across different test cases.
    let tokenA, tokenB, simpleSwap;
    let owner, user1;

    // Helper function to generate a future timestamp (1 hour from now) to be used as a transaction deadline.
    const DEADLINE = () => Math.floor(Date.now() / 1000) + 3600; // 1 hour from current time

    // This beforeEach hook runs before each test within the "SimpleSwap" suite.
    // It deploys the necessary contracts (TokenA, TokenB, and SimpleSwap) for testing.
    beforeEach(async () => {
        // Retrieve the first two accounts provided by Hardhat for testing purposes.
        [owner, user1] = await ethers.getSigners();

        // Get the contract factory for TokenA and deploy an instance of it.
        const TokenA = await ethers.getContractFactory("TokenA");
        tokenA = await TokenA.deploy();

        // Get the contract factory for TokenB and deploy an instance of it.
        const TokenB = await ethers.getContractFactory("TokenB");
        tokenB = await TokenB.deploy();

        // Get the contract factory for SimpleSwap.
        const SimpleSwap = await ethers.getContractFactory("SimpleSwap");
        // Deploy SimpleSwap, providing the addresses of the newly deployed TokenA and TokenB.
        simpleSwap = await SimpleSwap.deploy(await tokenA.getAddress(), await tokenB.getAddress());
    });

    // Test suite specifically for the deployment process of the SimpleSwap contract.
    describe("Deployment", () => {
        // Test case: Verifies that the SimpleSwap contract correctly stores and returns the addresses
        // of the ERC-20 tokens (TokenA and TokenB) it was initialized with.
        it("Should deploy with correct token addresses", async () => {
            // Assert that the TokenA address stored in SimpleSwap matches the address of the deployed TokenA contract.
            expect(await simpleSwap.TokenA()).to.equal(await tokenA.getAddress());
            // Assert that the TokenB address stored in SimpleSwap matches the address of the deployed TokenB contract.
            expect(await simpleSwap.TokenB()).to.equal(await tokenB.getAddress());
        });

        // Test case: Verifies that the SimpleSwap contract deployment reverts (fails) if
        // both token addresses provided during deployment are identical. This prevents
        // creating a liquidity pool with the same token on both sides.
        it("Should revert if tokens are identical", async () => {
            const factory = await ethers.getContractFactory("SimpleSwap");
            const tokenAddress = await tokenA.getAddress(); // Use TokenA's address for both arguments
            // Expect the deployment transaction to revert with a specific error message "IDENTICAL_ADDRESSES".
            await expect(factory.deploy(tokenAddress, tokenAddress)).to.be.revertedWith("IDENTICAL_ADDRESSES");
        });
    });

    // Test suite for the addLiquidity function, which allows users to provide liquidity to the pool.
    describe("addLiquidity", () => {
        // Test case: Verifies that liquidity can be successfully added to the pool and that
        // LP (Liquidity Provider) tokens are minted and issued to the liquidity provider.
        it("Should add liquidity and mint LP tokens", async () => {
            const amountA = ethers.parseEther("1000"); // Amount of TokenA to add
            const amountB = ethers.parseEther("1000"); // Amount of TokenB to add

            // Approve the SimpleSwap contract to spend the specified amounts of TokenA and TokenB
            // from the owner's balance. This is required before the contract can transfer them.
            await tokenA.approve(simpleSwap, amountA);
            await tokenB.approve(simpleSwap, amountB);

            // Call the addLiquidity function on the SimpleSwap contract.
            const tx = await simpleSwap.addLiquidity(
                await tokenA.getAddress(), // Address of token_A
                await tokenB.getAddress(), // Address of token_B
                amountA, // Desired amount of token_A to add
                amountB, // Desired amount of token_B to add
                amountA, // amountAMin: Minimum acceptable amount of token_A to add
                amountB, // amountBMin: Minimum acceptable amount of token_B to add
                owner.address, // Recipient address for LP tokens
                DEADLINE() // Transaction deadline
            );

            // Expect that a "LiquidityAdded" event is emitted upon successful liquidity addition.
            await expect(tx).to.emit(simpleSwap, "LiquidityAdded");
            // Expect that the total supply of LP tokens in the SimpleSwap contract is now greater than zero.
            expect(await simpleSwap.totalSupply()).to.be.gt(0);
        });

        // Test case: Verifies that the addLiquidity function reverts if the transaction deadline has expired.
        // This protects against front-running and stale transactions.
        it("Should revert if deadline expired", async () => {
            const tokenAAddr = await tokenA.getAddress();
            const tokenBAddr = await tokenB.getAddress();

            // Attempt to call addLiquidity with a deadline set to 0, which means it has already expired.
            // Expect the transaction to revert with the error message "EXPIRED".
            await expect(simpleSwap.addLiquidity(
                tokenAAddr,
                tokenBAddr,
                ethers.parseEther("100"),
                ethers.parseEther("100"),
                ethers.parseEther("100"),
                ethers.parseEther("100"),
                owner.address,
                0 // Expired deadline
            )).to.be.revertedWith("EXPIRED");
        });

        // Test case: Verifies that the addLiquidity function reverts if the provided token pair
        // is in an invalid order (e.g., TokenB provided as the first token and TokenA as the second).
        // The contract expects a specific canonical order (e.g., TokenA always before TokenB).
        it("Should revert if token pair invalid", async () => {
            // Attempt to add liquidity by passing TokenB's address first and TokenA's address second.
            // Expect the transaction to revert with the error message "INVALID_TOKEN_PAIR".
            await expect(simpleSwap.addLiquidity(
                await tokenB.getAddress(), // TokenB passed as token0
                await tokenA.getAddress(), // TokenA passed as token1
                100, 100, 100, 100,
                owner.address,
                DEADLINE()
            )).to.be.revertedWith("INVALID_TOKEN_PAIR");
        });

        // Test case: Verifies that the addLiquidity function reverts if the recipient address
        // for the LP tokens is the zero address (0x00...00).
        it("Should revert if recipient is zero address", async () => {
            const amount = ethers.parseEther("1000");
            await tokenA.approve(simpleSwap, amount);
            await tokenB.approve(simpleSwap, amount);

            // Attempt to add liquidity, specifying the zero address as the recipient.
            // Expect the transaction to revert with the error message "INVALID_RECIPIENT".
            await expect(simpleSwap.addLiquidity(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
                amount,
                amount,
                0, // amountAMin (can be 0 for this test)
                0, // amountBMin (can be 0 for this test)
                ethers.ZeroAddress, // Recipient is the zero address
                DEADLINE()
            )).to.be.revertedWith("INVALID_RECIPIENT");
        });

        // Test case: Verifies that addLiquidity reverts if the actual amount of TokenB
        // received/contributed (based on current pool reserves and amountA provided) is less
        // than the specified minimum amountBMin. This protects the liquidity provider from slippage.
        it("Should revert if amountBOptimal < amountBMin", async () => {
            const amount = ethers.parseEther("1000");
            await tokenA.approve(simpleSwap, amount);
            await tokenB.approve(simpleSwap, amount);

            // First, add some initial liquidity to establish a pool state (reserves).
            await simpleSwap.addLiquidity(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
                amount,
                amount,
                0, // amountAMin (set to 0 as not critical for this test)
                0, // amountBMin (set to 0 as not critical for this test)
                owner.address,
                DEADLINE()
            );

            // Re-approve tokens for the next liquidity addition attempt.
            await tokenA.approve(simpleSwap, amount);
            await tokenB.approve(simpleSwap, amount);

            // Attempt to add more liquidity, but set 'amountBMin' to an unrealistically high value
            // (e.g., 2000 Ether) that cannot be met when providing only 1000 Ether of TokenB,
            // given the current pool ratio. This simulates a slippage protection trigger.
            await expect(simpleSwap.addLiquidity(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
                amount, // Desired amount of TokenA to add
                amount, // Desired amount of TokenB to add (1000)
                0, // amountAMin
                ethers.parseEther("2000"), // amountBMin: Set higher than the provided amountB, expecting revert.
                owner.address,
                DEADLINE()
            )).to.be.revertedWith("INSUFFICIENT_B_AMOUNT");
        });
    });

    // Test suite for the removeLiquidity function, which allows users to withdraw their liquidity.
    describe("removeLiquidity", () => {
        // This beforeEach hook runs before each test within the "removeLiquidity" suite.
        // It ensures there is existing liquidity in the pool for the tests to interact with.
        beforeEach(async () => {
            const amount = ethers.parseEther("1000");
            // Approve SimpleSwap to spend TokenA and TokenB for initial liquidity provision.
            await tokenA.approve(simpleSwap, amount);
            await tokenB.approve(simpleSwap, amount);

            // Add an initial amount of liquidity from the owner's address.
            await simpleSwap.addLiquidity(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
                amount,
                amount,
                amount, // amountAMin
                amount, // amountBMin
                owner.address,
                DEADLINE()
            );
        });

        // Test case: Verifies that liquidity can be successfully removed from the pool,
        // and the corresponding ERC-20 tokens are returned to the liquidity provider.
        it("Should remove liquidity and return tokens", async () => {
            // Get the current balance of LP tokens held by the owner.
            const lpBalance = await simpleSwap.balanceOf(owner.address);
            // Approve the SimpleSwap contract to burn (transfer from) the owner's LP tokens.
            await simpleSwap.approve(simpleSwap, lpBalance);

            // Call the removeLiquidity function to withdraw all of the owner's liquidity.
            const tx = await simpleSwap.removeLiquidity(
                await tokenA.getAddress(), // Address of token_A
                await tokenB.getAddress(), // Address of token_B
                lpBalance, // Amount of LP tokens to burn
                0, // amountAMin: Minimum acceptable amount of token_A to receive (set to 0 for this successful test)
                0, // amountBMin: Minimum acceptable amount of token_B to receive (set to 0 for this successful test)
                owner.address, // Recipient address for the returned tokens
                DEADLINE() // Transaction deadline
            );

            // Expect that a "LiquidityRemoved" event is emitted upon successful liquidity removal.
            await expect(tx).to.emit(simpleSwap, "LiquidityRemoved");
        });

        // Test case: Verifies that the removeLiquidity function reverts if an invalid token pair
        // (e.g., tokens provided in the wrong order) is specified.
        it("Should revert with invalid token pair", async () => {
            // Attempt to remove liquidity by swapping the order of TokenA and TokenB addresses.
            // Expect the transaction to revert with the error message "INVALID_TOKEN_PAIR".
            await expect(simpleSwap.removeLiquidity(
                await tokenB.getAddress(), // TokenB passed as token0
                await tokenA.getAddress(), // TokenA passed as token1
                1000, 0, 0, // LP amount and min outputs (values don't matter for this revert)
                owner.address,
                DEADLINE()
            )).to.be.revertedWith("INVALID_TOKEN_PAIR");
        });

        // Test case: Verifies that the removeLiquidity function reverts if the user attempts
        // to remove more liquidity (LP tokens) than they actually possess.
        it("Should revert with insufficient liquidity", async () => {
            // Attempt to remove a very large amount of LP tokens that the owner does not hold.
            // Expect the transaction to revert with the error message "INSUFFICIENT_LIQUIDITY".
            await expect(simpleSwap.removeLiquidity(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
                ethers.parseEther("999999"), // An excessively large amount of LP tokens
                0, 0, // Min outputs
                owner.address,
                DEADLINE()
            )).to.be.revertedWith("INSUFFICIENT_LIQUIDITY");
        });

        // Test case: Verifies that the removeLiquidity function reverts if the actual amounts
        // of tokens returned are less than the specified minimum acceptable output amounts (slippage protection).
        it("Should revert if output tokens are less than minimum", async () => {
            const amount = ethers.parseEther("1000");
            await tokenA.approve(simpleSwap, amount);
            await tokenB.approve(simpleSwap, amount);

            // Add liquidity to ensure there are LP tokens for the test.
            await simpleSwap.addLiquidity(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
                amount,
                amount,
                0, // amountAMin
                0, // amountBMin
                owner.address,
                DEADLINE()
            );

            const liquidity = await simpleSwap.balanceOf(owner.address);
            await simpleSwap.approve(simpleSwap, liquidity);

            // Attempt to remove liquidity, but set 'amountAMin' to an unrealistically high value.
            // This will cause the transaction to revert because the actual output of TokenA cannot meet this minimum.
            await expect(simpleSwap.removeLiquidity(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
                liquidity, // Amount of LP tokens to burn
                ethers.parseEther("1000000"), // amountAMin: Set higher than possible actual output
                0, // amountBMin
                owner.address,
                DEADLINE()
            )).to.be.revertedWith("INSUFFICIENT_OUTPUT_AMOUNT");
        });
    });

    // Test suite for the swapExactTokensForTokens function, which allows users to exchange tokens.
    describe("swapExactTokensForTokens", () => {
        // This beforeEach hook runs before each test in the "swapExactTokensForTokens" suite.
        // It adds initial liquidity to the pool, making swaps possible.
        beforeEach(async () => {
            const amount = ethers.parseEther("1000");
            await tokenA.approve(simpleSwap, amount);
            await tokenB.approve(simpleSwap, amount);

            // Add initial liquidity to the SimpleSwap pool.
            await simpleSwap.addLiquidity(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
                amount,
                amount,
                0, // amountAMin
                0, // amountBMin
                owner.address,
                DEADLINE()
            );
        });

        // Test case: Verifies that a token swap (e.g., TokenA for TokenB) can be successfully executed
        // and that a "SwapExecuted" event is emitted.
        it("Should perform swap and emit event", async () => {
            const amountIn = ethers.parseEther("100"); // Amount of TokenA to swap
            // Approve SimpleSwap to spend TokenA from the owner's balance for the swap.
            await tokenA.approve(simpleSwap, amountIn);

            // Call the swapExactTokensForTokens function to perform the swap.
            const tx = await simpleSwap.swapExactTokensForTokens(
                amountIn, // Exact amount of input tokens (TokenA)
                0, // amountOutMin: Minimum acceptable amount of output tokens (TokenB) to receive (set to 0 for this successful test)
                [await tokenA.getAddress(), await tokenB.getAddress()], // path: Array of token addresses representing the swap route (e.g., TokenA -> TokenB)
                owner.address, // Recipient address for the output tokens
                DEADLINE() // Transaction deadline
            );

            // Expect that a "SwapExecuted" event is emitted upon successful swap.
            await expect(tx).to.emit(simpleSwap, "SwapExecuted");
        });

        // Test case: Verifies that the swapExactTokensForTokens function reverts if an invalid path
        // (e.g., a path containing only one token instead of at least two) is provided.
        it("Should revert with invalid path", async () => {
            const tokenAAddress = await tokenA.getAddress();
            // Attempt to call swapExactTokensForTokens with a path array containing only one token.
            // Expect the transaction to revert with the error message "INVALID_PATH".
            await expect(simpleSwap.swapExactTokensForTokens(
                100, // amountIn
                0, // amountOutMin
                [tokenAAddress], // Invalid path: only one token
                owner.address,
                DEADLINE()
            )).to.be.revertedWith("INVALID_PATH");
        });

        // Test case: Verifies that the swapExactTokensForTokens function reverts if the actual
        // amount of output tokens received is less than the specified minimum output amount (slippage protection).
        it("Should revert if output is less than min", async () => {
            const amountIn = ethers.parseEther("100");
            await tokenA.approve(simpleSwap, amountIn);

            // Attempt to perform a swap, but set 'amountOutMin' to an unrealistically high value.
            // This will cause the transaction to revert because the actual output cannot meet this minimum.
            await expect(simpleSwap.swapExactTokensForTokens(
                amountIn, // amountIn
                ethers.parseEther("1000"), // amountOutMin: Set higher than possible actual output
                [await tokenA.getAddress(), await tokenB.getAddress()],
                owner.address,
                DEADLINE()
            )).to.be.revertedWith("INSUFFICIENT_OUTPUT_AMOUNT");
        });
    });

    // Test suite for the view functions of the SimpleSwap contract (e.g., getPrice, getAmountOut),
    // which read contract state without modifying it.
    describe("view functions", () => {
        // This beforeEach hook runs before each test in the "view functions" suite.
        // It adds initial liquidity to the pool, which is necessary for price calculations.
        beforeEach(async () => {
            const amount = ethers.parseEther("1000");
            await tokenA.approve(simpleSwap, amount);
            await tokenB.approve(simpleSwap, amount);

            // Add initial liquidity to the SimpleSwap pool.
            await simpleSwap.addLiquidity(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
                amount,
                amount,
                0, // amountAMin
                0, // amountBMin
                owner.address,
                DEADLINE()
            );
        });

        // Test case: Verifies that the getPrice function returns a valid price (a value greater than zero).
        // This indicates that the price calculation is working correctly for a valid token pair.
        it("Should return valid price", async () => {
            const tokenAAddress = await tokenA.getAddress();
            const tokenBAddress = await tokenB.getAddress();
            // Call the getPrice function to retrieve the price of TokenA relative to TokenB.
            const price = await simpleSwap.getPrice(tokenAAddress, tokenBAddress);
            // Expect the returned price to be a positive value.
            expect(price).to.be.gt(0);
        });

        // Test case: Verifies that the getPrice function reverts if an invalid token pair
        // (e.g., an address that is not TokenA or TokenB) is provided.
        it("Should revert if token pair invalid in price", async () => {
            // Generate a random, non-existent Ethereum address to simulate an invalid token.
            const fake = ethers.Wallet.createRandom().address;
            // Attempt to call getPrice with a fake token address.
            // Expect the transaction to revert with the error message "INVALID_TOKEN_PAIR".
            await expect(simpleSwap.getPrice(
                fake, // Invalid token address
                await tokenB.getAddress()
            )).to.be.revertedWith("INVALID_TOKEN_PAIR");
        });

        // Test case: Verifies that the getAmountOut function correctly calculates the expected
        // output amount of tokens given an input amount and the current reserves of the pool.
        it("Should calculate correct output using getAmountOut", async () => {
            // Call getAmountOut with a hypothetical input of 1 Token, and reserves of 1000 TokenA and 1000 TokenB.
            // In a simple constant product formula (X*Y=K) with no fees, swapping 1 TokenA for TokenB
            // with 1000:1000 reserves would yield (1000 * 1000) / (1000 + 1) = 999.000999... TokenB.
            // The expectation uses `closeTo` to account for potential minor floating-point differences.
            const amountOut = await simpleSwap.getAmountOut(
                ethers.parseEther("1"), // amountIn: Amount of input tokens
                ethers.parseEther("1000"), // reserveIn: Current reserve of the input token
                ethers.parseEther("1000") // reserveOut: Current reserve of the output token
            );
            // Expect the calculated output amount to be very close to 0.999 Ether.
            expect(amountOut).to.be.closeTo(
                ethers.parseEther("0.999"), // Expected value (approximate)
                ethers.parseEther("0.001") // Delta (tolerance) for the comparison
            );
        });
    });
});