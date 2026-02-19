/**
 * Debug: minimal CreateInstances call to diagnose BundleIdNotFound.
 *
 * Usage: node scripts/debug-create.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { lighthouse } = require("tencentcloud-sdk-nodejs-lighthouse");
const Client = lighthouse.v20200324.Client;

async function main() {
  const region = process.env.TENCENT_REGION;
  const bundleId = process.env.TENCENT_BUNDLE_ID;
  const blueprintId = process.env.TENCENT_BLUEPRINT_ID;

  console.log("=== Config ===");
  console.log(`  Region:      ${region}`);
  console.log(`  BundleId:    ${bundleId}`);
  console.log(`  BlueprintId: ${blueprintId}`);
  console.log();

  const client = new Client({
    credential: {
      secretId: process.env.TENCENT_SECRET_ID,
      secretKey: process.env.TENCENT_SECRET_KEY,
    },
    region,
  });

  // Step 1: Verify bundle exists
  console.log("=== Step 1: DescribeBundles ===");
  const bundles = await client.DescribeBundles({});
  const match = bundles.BundleSet?.find((b) => b.BundleId === bundleId);
  if (match) {
    console.log(`  Found: ${match.BundleId} (${match.BundleType}, ${match.CPU}C/${match.Memory}G, ${match.BundleSalesState})`);
  } else {
    console.log(`  NOT FOUND in DescribeBundles!`);
    console.log(`  Available Linux bundles:`);
    bundles.BundleSet
      ?.filter((b) => b.SupportLinuxUnixPlatform)
      .forEach((b) => console.log(`    ${b.BundleId} (${b.BundleType})`));
    return;
  }

  // Step 2: Verify blueprint exists
  console.log("\n=== Step 2: DescribeBlueprints ===");

  // 2a: Try direct lookup
  console.log(`  2a: Direct lookup for ${blueprintId}...`);
  try {
    const direct = await client.DescribeBlueprints({
      BlueprintIds: [blueprintId],
    });
    const dm = direct.BlueprintSet?.[0];
    if (dm) {
      console.log(`  Found: ${dm.BlueprintId} (${dm.BlueprintName}, type=${dm.BlueprintType})`);
    } else {
      console.log(`  Not found via BlueprintIds filter`);
    }
  } catch (err) {
    console.log(`  Error: ${err.code} - ${err.message}`);
  }

  // 2b: List all user/custom blueprints
  console.log(`\n  2b: Listing all blueprints (Limit=100)...`);
  const bps = await client.DescribeBlueprints({ Limit: 100, Offset: 0 });
  console.log(`  Total: ${bps.TotalCount}, returned: ${bps.BlueprintSet?.length}`);

  const userBps = bps.BlueprintSet?.filter((b) => b.BlueprintType === "USER" || b.BlueprintType === "PRIVATE") || [];
  console.log(`  Custom/private blueprints (${userBps.length}):`);
  userBps.forEach((b) => console.log(`    ${b.BlueprintId} - ${b.BlueprintName} (${b.BlueprintType}, ${b.BlueprintState})`));

  const bpMatch = bps.BlueprintSet?.find((b) => b.BlueprintId === blueprintId);
  if (!bpMatch) {
    console.log(`\n  ${blueprintId} NOT in any results.`);
    console.log(`  Possible reasons:`);
    console.log(`    - Blueprint is in a different region (current: ${region})`);
    console.log(`    - Blueprint is still being created`);
    console.log(`    - Blueprint ID is a snapshot ID, not a blueprint ID`);
    console.log(`\n  All blueprint types found:`);
    const types = [...new Set(bps.BlueprintSet?.map((b) => b.BlueprintType) || [])];
    types.forEach((t) => {
      const count = bps.BlueprintSet?.filter((b) => b.BlueprintType === t).length;
      console.log(`    ${t}: ${count}`);
    });
    return;
  }

  // Step 3: DryRun CreateInstances
  console.log("\n=== Step 3: CreateInstances (DryRun) ===");
  const params = {
    BundleId: bundleId,
    BlueprintId: blueprintId,
    InstanceCount: 1,
    InstanceName: "debug-test",
    DryRun: true,
  };
  console.log("  Params:", JSON.stringify(params, null, 4));

  try {
    const result = await client.CreateInstances(params);
    console.log("\n  DryRun OK! (would succeed)");
    console.log("  Response:", JSON.stringify(result, null, 4));
  } catch (err) {
    console.log(`\n  DryRun FAILED:`);
    console.log(`    Code:      ${err.code}`);
    console.log(`    Message:   ${err.message}`);
    console.log(`    RequestId: ${err.requestId}`);
  }

  // Step 4: Try with InstanceChargePrepaid
  console.log("\n=== Step 4: CreateInstances with InstanceChargePrepaid (DryRun) ===");
  const params2 = {
    ...params,
    InstanceChargePrepaid: { Period: 1, RenewFlag: "NOTIFY_AND_MANUAL_RENEW" },
  };
  console.log("  Params:", JSON.stringify(params2, null, 4));

  try {
    const result = await client.CreateInstances(params2);
    console.log("\n  DryRun OK! (would succeed)");
    console.log("  Response:", JSON.stringify(result, null, 4));
  } catch (err) {
    console.log(`\n  DryRun FAILED:`);
    console.log(`    Code:      ${err.code}`);
    console.log(`    Message:   ${err.message}`);
    console.log(`    RequestId: ${err.requestId}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
