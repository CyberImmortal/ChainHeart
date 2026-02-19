/**
 * Manually test the cloud provider - calls the exact same createServer /
 * getServer / destroyServer methods that onElectedMaster uses in production.
 *
 * Usage:
 *   node scripts/test-provider.js              # create server
 *   node scripts/test-provider.js query <id>   # query instance status
 *   node scripts/test-provider.js destroy <id> # destroy instance
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { createProvider } = require("../client/providers");

// Same factory used in client/index.js main()
const provider = createProvider();

if (!provider) {
  console.error("CLOUD_PROVIDER is not set in .env");
  process.exit(1);
}

const action = process.argv[2] || "create";
const instanceId = process.argv[3];

async function main() {
  console.log(`Provider: ${provider.name}`);
  console.log(`Action:   ${action}\n`);

  switch (action) {
    case "create": {
      // Same call as onElectedMaster -> cloudProvider.createServer()
      const result = await provider.createServer();
      console.log("\n=== Create Result ===");
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "query": {
      if (!instanceId) { console.error("Usage: ... query <instanceId>"); process.exit(1); }
      const info = await provider.getServer(instanceId);
      console.log("\n=== Query Result ===");
      console.log(JSON.stringify(info, null, 2));
      break;
    }
    case "destroy": {
      if (!instanceId) { console.error("Usage: ... destroy <instanceId>"); process.exit(1); }
      const result = await provider.destroyServer(instanceId);
      console.log("\n=== Destroy Result ===");
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    default:
      console.error(`Unknown action: ${action}. Supported: create, query, destroy`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  if (err.code) console.error("Code:", err.code);
  if (err.requestId) console.error("RequestId:", err.requestId);
  process.exit(1);
});
