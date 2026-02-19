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
  await heart.waitForDeployment();

  const address = await heart.getAddress();

  console.log(`  Contract deployed to: ${address}`);
  console.log("\nDone. Set CONTRACT_ADDRESS in .env to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
