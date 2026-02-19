const BaseProvider = require("./base");

/** AWS EC2 / Lightsail - placeholder */
class AwsProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = "aws";
  }
}

module.exports = AwsProvider;
