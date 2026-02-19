const hre = require("hardhat");

async function main() {
  const heartbeatTimeout = process.env.HEARTBEAT_TIMEOUT || 3600;
  const initialMasterMAC = process.env.INITIAL_MASTER_MAC || "";

  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying ChainHeart...");
  console.log(`  Deployer / shared key: ${deployer.address}`);
  console.log(`  Heartbeat timeout: ${heartbeatTimeout}s`);
  console.log(`  Initial master MAC: ${initialMasterMAC || "(none)"}`);

  const ChainHeart = await hre.ethers.getContractFactory("ChainHeart");
  const heart = await ChainHeart.deploy(
    heartbeatTimeout,
    deployer.address,
    initialMasterMAC
  );

  // Some RPC providers (e.g. BSC) return "" instead of null for the `to`
  // field on contract creation txs, which breaks ethers v6 parsing.
  // Fall back to waiting for the receipt via the provider directly.
  let address;
  try {
    await heart.waitForDeployment();
    address = await heart.getAddress();
  } catch {
    const tx = heart.deploymentTransaction();
    if (!tx || !tx.hash) throw new Error("Deployment transaction not found");
    console.log(`  Tx hash: ${tx.hash}`);
    console.log("  Waiting for confirmation...");
    const receipt = await hre.ethers.provider.waitForTransaction(tx.hash);
    address = receipt.contractAddress;
  }

  console.log(`  Contract deployed to: ${address}`);
  console.log("\nDone. Set CONTRACT_ADDRESS in .env to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
