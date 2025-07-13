// SimpleSwap.js
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Local
export default buildModule("SimpleSwapModule", (m) => {
  const SimpleSwapModule = m.contract("SimpleSwap", [
    "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
  ]);
  return { SimpleSwapModule };
});

// Sepolia
/*
export default buildModule("SimpleSwapModule", (m) => {
  const SimpleSwapModule = m.contract("SimpleSwap", [
    "0xf0c9cB1cc7bA04F96e9Eca5EAF56DCb8c280304f",
    "0x3d725d3c8264bc1927762caCb39EE6E097a170bA"
  ]);
  return { SimpleSwapModule };
});
*/