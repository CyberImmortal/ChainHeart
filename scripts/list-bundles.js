/**
 * List available Tencent Lighthouse bundles for the configured region.
 *
 * Usage: node scripts/list-bundles.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const { lighthouse } = require("tencentcloud-sdk-nodejs-lighthouse");
  const Client = lighthouse.v20200324.Client;

  const region = process.env.TENCENT_REGION;
  if (!region) { console.error("TENCENT_REGION is not set"); process.exit(1); }
  if (!process.env.TENCENT_SECRET_ID) { console.error("TENCENT_SECRET_ID is not set"); process.exit(1); }

  const client = new Client({
    credential: {
      secretId: process.env.TENCENT_SECRET_ID,
      secretKey: process.env.TENCENT_SECRET_KEY,
    },
    region,
  });

  console.log(`Region: ${region}\n`);

  const result = await client.DescribeBundles({});
  const bundles = result.BundleSet || [];

  console.log(`Found ${bundles.length} bundles:\n`);
  console.log(
    "BundleId".padEnd(28) +
    "CPU".padEnd(6) +
    "Mem".padEnd(8) +
    "Disk".padEnd(10) +
    "BW".padEnd(8) +
    "Traffic".padEnd(12) +
    "Price(CNY/mo)"
  );
  console.log("-".repeat(90));

  for (const b of bundles) {
    if (!b.SupportLinuxInstanceCount || b.SupportLinuxInstanceCount <= 0) continue;
    console.log(
      (b.BundleId || "").padEnd(28) +
      `${b.CPU}C`.padEnd(6) +
      `${b.Memory}G`.padEnd(8) +
      `${b.SystemDiskSize}G`.padEnd(10) +
      `${b.InternetMaxBandwidthOut}M`.padEnd(8) +
      `${b.MonthlyTraffic}G`.padEnd(12) +
      `${b.Price?.InstancePrice?.OriginalBundlePrice || "?"}`
    );
  }
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
