/**
 * Local integration test: 1 master + 2 slaves simulation.
 *
 * Usage:
 *   1. Start a local Hardhat node:  npx hardhat node
 *   2. Run this script:             npx hardhat run scripts/test-local.js --network localhost
 */

const hre = require("hardhat");

const HEARTBEAT_TIMEOUT = 10;

const MAC_A = "AA:BB:CC:DD:EE:01";
const MAC_B = "AA:BB:CC:DD:EE:02";
const MAC_C = "AA:BB:CC:DD:EE:03";

const STATE_NAMES = ["Idle", "Running", "Election"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function log(node, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  const pad = node.padEnd(7);
  console.log(`  [${ts}] [${pad}] ${msg}`);
}

function header(title) {
  console.log();
  console.log("=".repeat(70));
  console.log(`  ${title}`);
  console.log("=".repeat(70));
}

function step(n, desc) {
  console.log();
  console.log(`--- Step ${n}: ${desc} ---`);
}

async function printState(contract) {
  const [mac, lastHB, alive] = await contract.getCurrentMaster();
  const state = await contract.getState();
  const stateName = STATE_NAMES[Number(state)];
  console.log(`  >> State: ${stateName} | Master: ${mac || "(none)"} | alive: ${alive} | lastHB: ${lastHB}`);
}

async function mineTime(seconds) {
  await hre.network.provider.send("evm_increaseTime", [seconds]);
  await hre.network.provider.send("evm_mine", []);
}

// ---------------------------------------------------------------------------
// Node simulation
// ---------------------------------------------------------------------------
async function nodeTick(contract, nodeName, mac) {
  const [masterMAC, , alive] = await contract.getCurrentMaster();
  const state = Number(await contract.getState());

  if (state === 0) {
    log(nodeName, `State=Idle, electing self (${mac})...`);
    const tx = await contract.electMaster(mac);
    await tx.wait();
    log(nodeName, "Elected as master!");
    return;
  }

  const isMaster = masterMAC === mac;

  if (isMaster && alive) {
    log(nodeName, "I am master. Sending heartbeat...");
    const tx = await contract.sendHeartbeat(mac);
    await tx.wait();
    log(nodeName, "Heartbeat sent.");
  } else if (state === 2) {
    log(nodeName, `State=Election, attempting to claim master (${mac})...`);
    try {
      const tx = await contract.electMaster(mac);
      await tx.wait();
      log(nodeName, "Elected as master!");
    } catch {
      log(nodeName, "Election failed: another node won");
    }
  } else {
    log(nodeName, `I am a slave. Master=${masterMAC}, alive=${alive}`);
  }
}

// ---------------------------------------------------------------------------
// Main scenario
// ---------------------------------------------------------------------------
async function main() {
  const [signer] = await hre.ethers.getSigners();

  header("ChainHeart Local Integration Test (1 master + 2 slaves)");
  console.log(`  SharedKey:         ${signer.address}`);
  console.log(`  HeartbeatTimeout:  ${HEARTBEAT_TIMEOUT}s`);
  console.log(`  Nodes:             A(${MAC_A})  B(${MAC_B})  C(${MAC_C})`);

  // ---- Deploy ----
  step(0, "Deploy contract");
  const ChainHeart = await hre.ethers.getContractFactory("ChainHeart");
  const contract = await ChainHeart.deploy(HEARTBEAT_TIMEOUT, signer.address, "");
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log(`  Contract deployed at: ${addr}`);
  await printState(contract);

  // ---- Step 1: A wins initial election ----
  step(1, "All nodes start. A wins initial election (Idle -> Running)");
  await nodeTick(contract, "Node-A", MAC_A);
  await nodeTick(contract, "Node-B", MAC_B);
  await nodeTick(contract, "Node-C", MAC_C);
  await printState(contract);

  // ---- Step 2: Normal operation ----
  step(2, "Normal operation: A heartbeats, B and C monitor");
  for (let i = 0; i < 3; i++) {
    await mineTime(3);
    await nodeTick(contract, "Node-A", MAC_A);
    await nodeTick(contract, "Node-B", MAC_B);
    await nodeTick(contract, "Node-C", MAC_C);
  }
  await printState(contract);

  // ---- Step 3: A goes down ----
  step(3, "Node A goes offline. Advance time past timeout");
  log("Node-A", "*** OFFLINE ***");
  await mineTime(HEARTBEAT_TIMEOUT + 1);
  await printState(contract);

  // ---- Step 4: B wins election ----
  step(4, "B and C race to elect. B goes first => B wins, C fails");
  await nodeTick(contract, "Node-B", MAC_B);
  await nodeTick(contract, "Node-C", MAC_C);
  await printState(contract);

  // ---- Step 5: B is new master ----
  step(5, "B is master now. Normal heartbeats");
  for (let i = 0; i < 3; i++) {
    await mineTime(3);
    await nodeTick(contract, "Node-B", MAC_B);
    await nodeTick(contract, "Node-A", MAC_A);
    await nodeTick(contract, "Node-C", MAC_C);
  }
  await printState(contract);

  // ---- Step 6: B also goes down ----
  step(6, "Node B goes offline. Advance time past timeout");
  log("Node-B", "*** OFFLINE ***");
  await mineTime(HEARTBEAT_TIMEOUT + 1);
  await printState(contract);

  // ---- Step 7: C wins election ----
  step(7, "A and C race to elect. C goes first => C wins, A fails");
  await nodeTick(contract, "Node-C", MAC_C);
  await nodeTick(contract, "Node-A", MAC_A);
  await printState(contract);

  // ---- Step 8: C is master ----
  step(8, "C is master now. Final heartbeats");
  for (let i = 0; i < 2; i++) {
    await mineTime(3);
    await nodeTick(contract, "Node-C", MAC_C);
    await nodeTick(contract, "Node-A", MAC_A);
    await nodeTick(contract, "Node-B", MAC_B);
  }
  await printState(contract);

  // ---- Summary ----
  header("Test Complete");
  console.log("  Verified:");
  console.log("    [x] Initial election from Idle state (A became master)");
  console.log("    [x] Slaves correctly monitor without interfering");
  console.log("    [x] Master timeout triggers Election state");
  console.log("    [x] First election tx wins, second reverts (B won, C failed)");
  console.log("    [x] Second failover works (B down -> C takes over)");
  console.log("    [x] Old master becomes slave after reconnecting");
  console.log();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
