// Global variables

/** 
 * Web3 instance used to interact with the Ethereum provider 
 */
let web3;

/** 
 * Currently connected user wallet address 
 */
let address;

/** 
 * Instance of the smart contract used for token swapping 
 */
let swapInstance;

/** 
 * Indicates whether tokenA has been approved for exchange
 * If = 0, approval is needed; otherwise swap can proceed 
 */
let buyOrApprove = 0;

/** 
 * Current price of TokenB relative to TokenA 
 */
let P1 = 1;

window.addEventListener("DOMContentLoaded", async () => {
  // Verify MetaMask availability before initializing
  const available = detectMetaMask();
  if (!available) return;

  // If already connected, proceed to reconnect and fetch balances
  const isConnected = getFromLocalStorage("SwapConected");
  await init();
  if (isConnected === "true") {
    await connect();
  }
});

/**
 * Initializes the Web3 provider and loads initial data
 * - Instantiates contract
 * - Fetches token price
 */
async function init() {
  web3 = new Web3(window.ethereum);
  swapInstance = new web3.eth.Contract(exchange_abi, exchange_address);

  try {
    // Retrieve token price from contract
    const price = await swapInstance.methods.getPrice(tokena_address, tokenb_address).call();
    P1 = Number(price);

    // Update price in UI
    document.querySelector(".precio").textContent = P1;
  } catch (error) {
    console.error("Failed to fetch token price:", error);
    showToast("Failed to fetch token price", "red");
  }
}

/**
 * Connects to the user's wallet using MetaMask
 * Updates UI and loads token balances
 */
async function connect() {
  try {
    const accountLabel = document.getElementById("account");
    if (!accountLabel) {
      showToast("Element #account not found", "red");
      console.warn("Element #account is missing");
      return;
    }

    // Request wallet connection
    await window.ethereum.request({ method: "eth_requestAccounts" });
    const accounts = await web3.eth.getAccounts();
    address = accounts[0];

    // Display shortened address
    accountLabel.textContent = address.slice(0, 6) + "...";
    saveToLocalStorage("SwapConected", "true");

    await setBalanceTokenA();
    await setBalanceTokenB();
    await checkAllowance();

    document.getElementById("swap-submit").textContent = "Swap";
  } catch (error) {
    console.error("MetaMask connection failed:", error);
    showToast("Unable to connect to MetaMask", "red");
  }
}

/**
 * Authorizes exchange contract to spend TokenA
 * using approve() method from ERC-20 standard
 */
async function authorizeTokenA() {
  try {
    const amountRaw = document.querySelector(".IHAVE").value.trim();

    // Validate amount input
    if (!amountRaw || isNaN(parseFloat(amountRaw)) || parseFloat(amountRaw) <= 0) {
      showToast("Invalid amount for approval", "red");
      return;
    }

    const decimals = 18;
    const amount = BigInt(Math.floor(parseFloat(amountRaw) * 10 ** decimals));
    const tokenaInstance = new web3.eth.Contract(tokena_abi, tokena_address);

    await tokenaInstance.methods
      .approve(exchange_address, amount.toString())
      .send({ from: address })
      .on("transactionHash", hash => showToast("Approval hash: " + hash, "orange"))
      .on("receipt", () => {
        showToast("Authorization complete", "green");
      });
  } catch (error) {
    console.error("Error approving TokenA:", error);
    showToast("Authorization error", "red");
  }
}

/**
 * Executes token swap using swapExactTokensForTokens()
 * If not approved, calls approve() instead
 */
async function handleSubmit() {
  try {
    const amountInRaw = document.querySelector(".IHAVE").value.trim();
    const amountOutMinRaw = document.querySelector(".IWANT").value.trim();

    // Parse and validate inputs
    const amountInFloat = parseFloat(amountInRaw);
    const amountOutMinFloat = parseFloat(amountOutMinRaw);

    if (isNaN(amountInFloat) || isNaN(amountOutMinFloat) || amountInFloat <= 0 || amountOutMinFloat <= 0) {
      showToast("Invalid amounts entered", "red");
      return;
    }

    const decimals = 18;
    const amountIn = BigInt(Math.floor(amountInFloat * 10 ** decimals));
    const amountOutMin = BigInt(Math.floor(amountOutMinFloat * 10 ** decimals));
    const path = [tokena_address, tokenb_address];
    const to = address;
    const deadline = Math.floor(Date.now() / 1000) + 300;

    if (buyOrApprove !== "0") {
      // Execute token swap
      await swapInstance.methods
        .swapExactTokensForTokens(
          amountIn.toString(),
          amountOutMin.toString(),
          path,
          to,
          deadline
        )
        .send({ from: address })
        .on("transactionHash", hash => showToast("Swap hash: " + hash, "orange"))
        .on("receipt", async () => {
          showToast("Swap successful", "green");
          await setBalanceTokenA();
          await setBalanceTokenB();
        });
    } else {
      // First-time approval fallback
      const tokenaInstance = new web3.eth.Contract(tokena_abi, tokena_address);
      await tokenaInstance.methods
        .approve(exchange_address, amountIn.toString())
        .send({ from: address })
        .on("transactionHash", hash => showToast("Approval hash: " + hash, "orange"))
        .on("receipt", async () => {
          showToast("Approval successful", "green");
          await checkAllowance();
          document.getElementById("swap-submit").textContent = buyOrApprove === "0" ? "Approve" : "Swap";
        });
    }
  } catch (error) {
    console.error("Transaction error:", error);
    showToast("Transaction failed", "red");
  }
}

/**
 * Retrieves and displays current TokenA balance
 */
async function setBalanceTokenA() {
  const tokenaInstance = new web3.eth.Contract(tokena_abi, tokena_address);
  const balance = await tokenaInstance.methods.balanceOf(address).call();
  document.getElementById("balanceTokenA").textContent = balance;
}

/**
 * Retrieves and displays current TokenB balance
 */
async function setBalanceTokenB() {
  const tokenbInstance = new web3.eth.Contract(tokenb_abi, tokenb_address);
  const balance = await tokenbInstance.methods.balanceOf(address).call();
  document.getElementById("balanceTokenB").textContent = balance;
}

/**
 * Verifies approved token allowance for exchange contract
 */
async function checkAllowance() {
  const tokenbInstance = new web3.eth.Contract(tokenb_abi, tokenb_address);
  const allowed = await tokenbInstance.methods.allowance(address, exchange_address).call();
  buyOrApprove = allowed;
}

/**
 * Recalculates TokenB equivalent based on input and current price
 */
function setValueTokenToSpend() {
  const amount0 = parseFloat(document.querySelector(".IHAVE").value) || 0;
  const amount1 = amount0 / P1;
  const readable = amount1.toFixed(20);
  document.querySelector(".IWANT").value = readable;
}

/**
 * Displays a toast notification with message and background color
 * Useful for feedback and status updates
 */
function showToast(message, color) {
  const toast = document.getElementById("toast");
  toast.innerHTML = message.match(/.{1,20}/g).map(line => `<div>${line}</div>`).join("");
  toast.style.backgroundColor = color;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

/**
 * Stores a key/value pair in localStorage
 */
function saveToLocalStorage(key, value) {
  localStorage.setItem(key, value);
}

/**
 * Retrieves a value from localStorage or returns fallback
 */
function getFromLocalStorage(key) {
  return localStorage.getItem(key) || "DE";
}

/**
 * Verifies if MetaMask is installed and usable
 * Updates UI accordingly and shows toast messages
 */
function detectMetaMask() {
  if (typeof window.ethereum === "undefined") {
    showToast("🔒 MetaMask not available. Please install it to use this dApp.", "red");
    const connectBtn = document.getElementById("conect");
    if (connectBtn) {
      connectBtn.disabled = true;
      connectBtn.textContent = "MetaMask not detected";
      connectBtn.style.backgroundColor = "#ccc";
    }
    return false;
  }

  if (window.ethereum.isMetaMask) {
    showToast("🦊 MetaMask detected. You can connect your wallet.", "green");
    return true;
  } else {
    showToast("⚠️ Another Ethereum provider detected, not MetaMask.", "orange");
    return false;
  }
}
