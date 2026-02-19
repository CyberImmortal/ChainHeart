const BaseProvider = require("./base");

/** 402 Payment based server provisioning - placeholder */
class Pay402Provider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = "pay402";
  }
}

module.exports = Pay402Provider;
