const BaseProvider = require("./base");

/** Alibaba Cloud ECS - placeholder */
class AliyunProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = "aliyun";
  }
}

module.exports = AliyunProvider;
