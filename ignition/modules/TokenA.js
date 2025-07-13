// TokenA.js
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("TokenA", (m) => {
  const tokena = m.contract("TokenA");
  return { tokena };
});
