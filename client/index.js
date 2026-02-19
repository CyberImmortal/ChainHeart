const { ethers } = require("ethers");
const { networkInterfaces } = require("os");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// ---------------------------------------------------------------------------
// ABI (only the functions/events we need)
// ---------------------------------------------------------------------------
const ABI = [
  "function currentMasterMAC() view returns (string)",
  "function heartbeatTimeout() view returns (uint256)",
  "function isAlive() view returns (bool)",
  "function getState() view returns (uint8)",
  "function getNodeHeartbeat(string mac) view returns (uint256)",
  "function getCurrentMaster() view returns (string mac, uint256 lastHeartbeat, bool alive)",
  "function sendHeartbeat(string mac)",
  "function electMaster(string mac)",
  "event Heartbeat(string indexed mac, uint256 timestamp, uint256 blockNumber)",
  "event MasterElected(string indexed newMasterMAC, uint256 timestamp)",
];

const STATE_NAMES = ["Idle", "Running", "Election"];

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const CONFIG = {
  rpcUrl: process.env.RPC_URL || process.env.BSC_RPC_URL || process.env.BSC_TESTNET_RPC_URL || process.env.SEPOLIA_RPC_URL || "http://127.0.0.1:8545",
  contractAddress: process.env.CONTRACT_ADDRESS,
  privateKey: process.env.PRIVATE_KEY,
  checkInterval: parseInt(process.env.CHECK_INTERVAL || "30", 10) * 1000,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getLocalMAC() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name]) {
      if (!iface.internal && iface.mac && iface.mac !== "00:00:00:00:00:00") {
        return iface.mac.toUpperCase();
      }
    }
  }
  throw new Error("Unable to determine local MAC address");
}

function log(level, msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Called when this node successfully becomes master.
 * Replace the placeholder log with actual business logic
 * (e.g. purchase server, start services, notify cluster).
 */
async function onElectedMaster(mac) {
  log("HOOK", `>>> onElectedMaster triggered | MAC: ${mac}`);
  log("HOOK", ">>> TODO: purchase server / start services");
  // await purchaseServer();
  // await startServices();
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
async function main() {
  if (!CONFIG.contractAddress) throw new Error("CONTRACT_ADDRESS is required");
  if (!CONFIG.privateKey) throw new Error("PRIVATE_KEY is required");

  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
  const wallet = new ethers.Wallet(CONFIG.privateKey, provider);
  const contract = new ethers.Contract(CONFIG.contractAddress, ABI, wallet);
  const localMAC = process.env.NODE_MAC || getLocalMAC();

  log("INFO", `Node started  | MAC: ${localMAC}`);
  log("INFO", `RPC: ${CONFIG.rpcUrl}`);
  log("INFO", `Contract: ${CONFIG.contractAddress}`);

  contract.on("MasterElected", (mac, ts) => {
    log("EVENT", `MasterElected => ${mac} at ${ts}`);
  });

  async function tick() {
    try {
      const [masterMAC, lastHB, alive] = await contract.getCurrentMaster();
      const state = await contract.getState();

      const stateNum = Number(state);
      log("INFO", `State: ${STATE_NAMES[stateNum]} | Master: ${masterMAC || "(none)"} | alive: ${alive} | lastHB: ${lastHB}`);

      if (stateNum === 0) {
        log("INFO", "Idle state. Electing self...");
        const tx = await contract.electMaster(localMAC);
        await tx.wait();
        log("INFO", "Election tx confirmed. I am now master.");
        await onElectedMaster(localMAC);
        return;
      }

      const isMaster = masterMAC === localMAC;

      if (isMaster && alive) {
        log("INFO", "I am master. Sending heartbeat...");
        const tx = await contract.sendHeartbeat(localMAC);
        await tx.wait();
        log("INFO", "Heartbeat sent.");
      } else if (stateNum === 2) {
        log("WARN", "Election state. Attempting to claim master...");
        try {
          const tx = await contract.electMaster(localMAC);
          await tx.wait();
          log("INFO", "Election tx confirmed. I am now master.");
          await onElectedMaster(localMAC);
        } catch (err) {
          log("WARN", `Election failed (another node may have won): ${err.message}`);
        }
      } else {
        log("INFO", "I am a slave. Monitoring master...");
      }
    } catch (err) {
      log("ERROR", `Tick error: ${err.message}`);
    }
  }

  await tick();
  setInterval(tick, CONFIG.checkInterval);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
