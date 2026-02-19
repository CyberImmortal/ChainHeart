const BaseProvider = require("./base");

/**
 * Tencent Cloud Lighthouse provider.
 *
 * Required env vars:
 *   TENCENT_SECRET_ID, TENCENT_SECRET_KEY, TENCENT_REGION,
 *   TENCENT_BUNDLE_ID, TENCENT_BLUEPRINT_ID
 *
 * Optional:
 *   TENCENT_INSTANCE_NAME, TENCENT_ZONE, TENCENT_LOGIN_KEY_ID,
 *   TENCENT_PURCHASE_MONTHS
 *
 * @see https://cloud.tencent.com/document/api/1207/47578
 */
class TencentLighthouseProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = "tencent-lighthouse";

    const missing = ["secretId", "secretKey", "region", "bundleId", "blueprintId"]
      .filter((k) => !config[k]);
    if (missing.length > 0) {
      throw new Error(`${this.name}: missing config: ${missing.join(", ")}`);
    }

    this.purchaseMonths = parseInt(config.purchaseMonths || "1", 10);

    const { lighthouse } = require("tencentcloud-sdk-nodejs-lighthouse");
    const LighthouseClient = lighthouse.v20200324.Client;

    this.client = new LighthouseClient({
      credential: {
        secretId: config.secretId,
        secretKey: config.secretKey,
      },
      region: config.region,
      profile: {
        httpProfile: { reqTimeout: 30 },
      },
    });

    this._log("init", {
      region: config.region,
      bundleId: config.bundleId,
      blueprintId: config.blueprintId,
      instanceName: config.instanceName || "ChainHeart-Node",
      zone: config.zone || "(auto)",
      purchaseMonths: this.purchaseMonths,
      loginKeyId: config.loginKeyId || "(none)",
    });
  }

  _log(action, detail) {
    const ts = new Date().toISOString();
    const payload = typeof detail === "string" ? detail : JSON.stringify(detail, null, 2);
    console.log(`[${ts}] [TENCENT] [${action}] ${payload}`);
  }

  async createServer(options = {}) {
    const params = {
      BundleId: options.bundleId || this.config.bundleId,
      BlueprintId: options.blueprintId || this.config.blueprintId,
      InstanceCount: 1,
      InstanceName: options.instanceName || this.config.instanceName || "ChainHeart-Node",
    };

    params.InstanceChargePrepaid = {
      Period: this.purchaseMonths || 1,
      RenewFlag: "NOTIFY_AND_MANUAL_RENEW",
    };

    if (this.config.zone) {
      params.Zones = [this.config.zone];
    }

    if (this.config.loginKeyId) {
      params.LoginConfiguration = { KeyIds: [this.config.loginKeyId] };
    }

    this._log("createServer:request", params);

    try {
      const result = await this.client.CreateInstances(params);
      const instanceIds = result.InstanceIdSet || [];

      this._log("createServer:response", {
        requestId: result.RequestId,
        instanceIds,
      });

      if (instanceIds.length > 0) {
        this._log("createServer:success", `Instance ${instanceIds[0]} created, waiting for it to boot...`);
        await this._waitForRunning(instanceIds[0]);
      }

      return {
        instanceIds,
        requestId: result.RequestId,
      };
    } catch (err) {
      this._log("createServer:error", {
        code: err.code || "UNKNOWN",
        message: err.message,
        requestId: err.requestId || null,
      });
      throw err;
    }
  }

  async getServer(instanceId) {
    this._log("getServer:request", { instanceId });

    try {
      const result = await this.client.DescribeInstances({
        InstanceIds: [instanceId],
      });

      const instance = result.InstanceSet?.[0];
      if (!instance) {
        this._log("getServer:response", "Instance not found");
        return null;
      }

      const info = {
        instanceId: instance.InstanceId,
        instanceName: instance.InstanceName,
        status: instance.InstanceState,
        publicIp: instance.PublicAddresses?.[0] || null,
        privateIp: instance.PrivateAddresses?.[0] || null,
        region: instance.Region,
        zone: instance.Zone,
        blueprintId: instance.BlueprintId,
        bundleId: instance.BundleId,
        createdTime: instance.CreatedTime,
        expiredTime: instance.ExpiredTime,
      };

      this._log("getServer:response", info);
      return info;
    } catch (err) {
      this._log("getServer:error", {
        code: err.code || "UNKNOWN",
        message: err.message,
        requestId: err.requestId || null,
      });
      throw err;
    }
  }

  async destroyServer(instanceId) {
    this._log("destroyServer:request", { instanceId });

    try {
      const result = await this.client.TerminateInstances({
        InstanceIds: [instanceId],
      });

      this._log("destroyServer:response", { requestId: result.RequestId });
      return { requestId: result.RequestId };
    } catch (err) {
      this._log("destroyServer:error", {
        code: err.code || "UNKNOWN",
        message: err.message,
        requestId: err.requestId || null,
      });
      throw err;
    }
  }

  async _waitForRunning(instanceId, maxRetries = 30, intervalMs = 10000) {
    for (let i = 1; i <= maxRetries; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));

      try {
        const result = await this.client.DescribeInstances({
          InstanceIds: [instanceId],
        });
        const instance = result.InstanceSet?.[0];
        const state = instance?.InstanceState;

        this._log("waitForRunning", `[${i}/${maxRetries}] ${instanceId} => ${state || "UNKNOWN"}`);

        if (state === "RUNNING") {
          this._log("waitForRunning:ready", {
            instanceId,
            publicIp: instance.PublicAddresses?.[0] || "(pending)",
            privateIp: instance.PrivateAddresses?.[0] || "(pending)",
          });
          return instance;
        }
      } catch (err) {
        this._log("waitForRunning:poll-error", `[${i}/${maxRetries}] ${err.message}`);
      }
    }

    this._log("waitForRunning:timeout", `${instanceId} did not reach RUNNING within ${maxRetries * intervalMs / 1000}s`);
  }
}

module.exports = TencentLighthouseProvider;
