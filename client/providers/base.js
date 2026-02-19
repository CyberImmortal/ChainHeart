/**
 * Abstract base class for cloud server providers.
 *
 * Subclasses must implement:
 *   - createServer(options)   -> { instanceId, ... }
 *   - getServer(instanceId)   -> { instanceId, status, publicIp, ... }
 *   - destroyServer(instanceId) -> void
 *
 * Each provider is constructed with a config object sourced from env vars.
 */
class BaseProvider {
  constructor(config = {}) {
    if (new.target === BaseProvider) {
      throw new Error("BaseProvider is abstract and cannot be instantiated directly");
    }
    this.config = config;
    this.name = "base";
  }

  async createServer(_options) {
    throw new Error(`${this.name}: createServer() not implemented`);
  }

  async getServer(_instanceId) {
    throw new Error(`${this.name}: getServer() not implemented`);
  }

  async destroyServer(_instanceId) {
    throw new Error(`${this.name}: destroyServer() not implemented`);
  }
}

module.exports = BaseProvider;
