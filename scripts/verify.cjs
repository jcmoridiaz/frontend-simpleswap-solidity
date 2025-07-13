// scripts/verify.cjs
const { run } = require("hardhat");

async function main() {
  await run("verify:verify", {
    address: "0x2Ae790cdf28f0e7373865B42e7D1E04017F4A856",
    constructorArguments: [
      "0xf0c9cB1cc7bA04F96e9Eca5EAF56DCb8c280304f",
      "0x3d725d3c8264bc1927762caCb39EE6E097a170bA"
    ],
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});


// Comando para verificacion
// npx hardhat run scripts/verify.cjs --network sepolia