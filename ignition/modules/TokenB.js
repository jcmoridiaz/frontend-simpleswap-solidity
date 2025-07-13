// TokenB.js
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("TokenB", (m) => {
  const tokenb = m.contract("TokenB");
  return { tokenb };
});
