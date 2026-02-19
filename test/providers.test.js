const { expect } = require("chai");

const BaseProvider = require("../client/providers/base");
const TencentLighthouseProvider = require("../client/providers/tencent-lighthouse");
const AliyunProvider = require("../client/providers/aliyun");
const AwsProvider = require("../client/providers/aws");
const Pay402Provider = require("../client/providers/pay402");
const { createProvider, PROVIDERS } = require("../client/providers");

describe("Cloud Providers", function () {

  // ---------------------------------------------------------------------------
  // BaseProvider
  // ---------------------------------------------------------------------------
  describe("BaseProvider", function () {
    it("should not be instantiated directly", function () {
      expect(() => new BaseProvider()).to.throw("BaseProvider is abstract");
    });

    it("should throw on unimplemented createServer", async function () {
      const provider = new AliyunProvider();
      try {
        await provider.createServer();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err.message).to.include("createServer() not implemented");
      }
    });

    it("should throw on unimplemented getServer", async function () {
      const provider = new AliyunProvider();
      try {
        await provider.getServer("i-123");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err.message).to.include("getServer() not implemented");
      }
    });

    it("should throw on unimplemented destroyServer", async function () {
      const provider = new AliyunProvider();
      try {
        await provider.destroyServer("i-123");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err.message).to.include("destroyServer() not implemented");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // TencentLighthouseProvider
  // ---------------------------------------------------------------------------
  describe("TencentLighthouseProvider", function () {
    const validConfig = {
      secretId: "test-secret-id",
      secretKey: "test-secret-key",
      region: "ap-guangzhou",
      bundleId: "bundle_test",
      blueprintId: "lhbp_test",
    };

    it("should instantiate with valid config", function () {
      const provider = new TencentLighthouseProvider(validConfig);
      expect(provider.name).to.equal("tencent-lighthouse");
      expect(provider.client).to.not.be.undefined;
    });

    it("should throw if secretId is missing", function () {
      const config = { ...validConfig, secretId: undefined };
      expect(() => new TencentLighthouseProvider(config)).to.throw(/secretId/);
    });

    it("should throw if secretKey is missing", function () {
      const config = { ...validConfig, secretKey: undefined };
      expect(() => new TencentLighthouseProvider(config)).to.throw(/secretKey/);
    });

    it("should throw if region is missing", function () {
      const config = { ...validConfig, region: undefined };
      expect(() => new TencentLighthouseProvider(config)).to.throw(/region/);
    });

    it("should throw if bundleId is missing", function () {
      const config = { ...validConfig, bundleId: undefined };
      expect(() => new TencentLighthouseProvider(config)).to.throw(/bundleId/);
    });

    it("should throw if blueprintId is missing", function () {
      const config = { ...validConfig, blueprintId: undefined };
      expect(() => new TencentLighthouseProvider(config)).to.throw(/blueprintId/);
    });

    it("should throw listing all missing fields at once", function () {
      expect(() => new TencentLighthouseProvider({}))
        .to.throw(/secretId.*secretKey.*region.*bundleId.*blueprintId/);
    });

    it("should accept optional instanceName and zone", function () {
      const config = { ...validConfig, instanceName: "my-node", zone: "ap-guangzhou-3" };
      const provider = new TencentLighthouseProvider(config);
      expect(provider.config.instanceName).to.equal("my-node");
      expect(provider.config.zone).to.equal("ap-guangzhou-3");
    });

    it("should have createServer, getServer, destroyServer methods", function () {
      const provider = new TencentLighthouseProvider(validConfig);
      expect(provider.createServer).to.be.a("function");
      expect(provider.getServer).to.be.a("function");
      expect(provider.destroyServer).to.be.a("function");
    });
  });

  // ---------------------------------------------------------------------------
  // Placeholder providers
  // ---------------------------------------------------------------------------
  describe("Placeholder providers", function () {
    it("AliyunProvider should have correct name", function () {
      const p = new AliyunProvider();
      expect(p.name).to.equal("aliyun");
    });

    it("AwsProvider should have correct name", function () {
      const p = new AwsProvider();
      expect(p.name).to.equal("aws");
    });

    it("Pay402Provider should have correct name", function () {
      const p = new Pay402Provider();
      expect(p.name).to.equal("pay402");
    });
  });

  // ---------------------------------------------------------------------------
  // Provider factory
  // ---------------------------------------------------------------------------
  describe("createProvider factory", function () {
    const originalEnv = { ...process.env };

    afterEach(function () {
      process.env = { ...originalEnv };
    });

    it("should return null when CLOUD_PROVIDER is not set", function () {
      delete process.env.CLOUD_PROVIDER;
      expect(createProvider()).to.be.null;
    });

    it("should throw for unknown provider name", function () {
      process.env.CLOUD_PROVIDER = "nonexistent";
      expect(() => createProvider()).to.throw('Unknown cloud provider: "nonexistent"');
    });

    it("should create TencentLighthouseProvider when configured", function () {
      process.env.CLOUD_PROVIDER = "tencent-lighthouse";
      process.env.TENCENT_SECRET_ID = "test-id";
      process.env.TENCENT_SECRET_KEY = "test-key";
      process.env.TENCENT_REGION = "ap-guangzhou";
      process.env.TENCENT_BUNDLE_ID = "bundle_test";
      process.env.TENCENT_BLUEPRINT_ID = "lhbp_test";

      const provider = createProvider();
      expect(provider).to.be.instanceOf(TencentLighthouseProvider);
      expect(provider.name).to.equal("tencent-lighthouse");
    });

    it("should list all supported providers", function () {
      expect(PROVIDERS).to.have.all.keys(
        "tencent-lighthouse", "aliyun", "aws", "pay402"
      );
    });
  });
});
