const TencentLighthouseProvider = require("./tencent-lighthouse");
const AliyunProvider = require("./aliyun");
const AwsProvider = require("./aws");
const Pay402Provider = require("./pay402");

const PROVIDERS = {
  "tencent-lighthouse": TencentLighthouseProvider,
  aliyun: AliyunProvider,
  aws: AwsProvider,
  pay402: Pay402Provider,
};

/**
 * Create a cloud provider instance based on CLOUD_PROVIDER env var.
 * Returns null if CLOUD_PROVIDER is not set (provider disabled).
 */
function createProvider() {
  const name = process.env.CLOUD_PROVIDER;
  if (!name) return null;

  const Provider = PROVIDERS[name];
  if (!Provider) {
    throw new Error(`Unknown cloud provider: "${name}". Supported: ${Object.keys(PROVIDERS).join(", ")}`);
  }

  const configMap = {
    "tencent-lighthouse": {
      secretId: process.env.TENCENT_SECRET_ID,
      secretKey: process.env.TENCENT_SECRET_KEY,
      region: process.env.TENCENT_REGION,
      bundleId: process.env.TENCENT_BUNDLE_ID,
      blueprintId: process.env.TENCENT_BLUEPRINT_ID,
      instanceName: process.env.TENCENT_INSTANCE_NAME,
      zone: process.env.TENCENT_ZONE,
      loginKeyId: process.env.TENCENT_LOGIN_KEY_ID,
      purchaseMonths: process.env.TENCENT_PURCHASE_MONTHS,
    },
    aliyun: {
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
      region: process.env.ALIYUN_REGION,
    },
    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
    },
    pay402: {
      endpoint: process.env.PAY402_ENDPOINT,
      token: process.env.PAY402_TOKEN,
    },
  };

  return new Provider(configMap[name] || {});
}

module.exports = { createProvider, PROVIDERS };
