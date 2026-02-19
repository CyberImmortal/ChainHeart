const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-network-helpers");

describe("ChainHeart", function () {
  const TIMEOUT = 3600;
  const MAC_A = "AA:BB:CC:DD:EE:01";
  const MAC_B = "AA:BB:CC:DD:EE:02";
  const MAC_C = "AA:BB:CC:DD:EE:03";

  const STATE_IDLE = 0;
  const STATE_RUNNING = 1;
  const STATE_ELECTION = 2;

  async function deployFixture() {
    const [shared, stranger] = await ethers.getSigners();
    const ChainHeart = await ethers.getContractFactory("ChainHeart");
    const heart = await ChainHeart.deploy(TIMEOUT, shared.address, "");
    return { heart, shared, stranger };
  }

  async function deployWithMasterFixture() {
    const [shared, stranger] = await ethers.getSigners();
    const ChainHeart = await ethers.getContractFactory("ChainHeart");
    const heart = await ChainHeart.deploy(TIMEOUT, shared.address, MAC_A);
    return { heart, shared, stranger };
  }

  // ---------------------------------------------------------------------------
  // Deployment
  // ---------------------------------------------------------------------------
  describe("Deployment", function () {
    it("should set sharedKeyAddress correctly", async function () {
      const { heart, shared } = await loadFixture(deployFixture);
      expect(await heart.sharedKeyAddress()).to.equal(shared.address);
    });

    it("should initialize heartbeatTimeout correctly", async function () {
      const { heart } = await loadFixture(deployFixture);
      expect(await heart.heartbeatTimeout()).to.equal(TIMEOUT);
    });

    it("should start with no master when initial MAC is empty", async function () {
      const { heart } = await loadFixture(deployFixture);
      const [mac, heartbeat, alive] = await heart.getCurrentMaster();
      expect(mac).to.equal("");
      expect(heartbeat).to.equal(0);
      expect(alive).to.equal(false);
    });

    it("should start in Idle state when no initial master", async function () {
      const { heart } = await loadFixture(deployFixture);
      expect(await heart.getState()).to.equal(STATE_IDLE);
    });

    it("should set initial master when provided in constructor", async function () {
      const { heart } = await loadFixture(deployWithMasterFixture);
      const [mac, heartbeat, alive] = await heart.getCurrentMaster();
      expect(mac).to.equal(MAC_A);
      expect(heartbeat).to.be.gt(0);
      expect(alive).to.equal(true);
    });

    it("should start in Running state when initial master is provided", async function () {
      const { heart } = await loadFixture(deployWithMasterFixture);
      expect(await heart.getState()).to.equal(STATE_RUNNING);
    });

    it("should emit MasterElected on deploy with initial master", async function () {
      const [shared] = await ethers.getSigners();
      const ChainHeart = await ethers.getContractFactory("ChainHeart");
      const heart = await ChainHeart.deploy(TIMEOUT, shared.address, MAC_A);
      const tx = heart.deploymentTransaction();
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (log) => heart.interface.parseLog(log)?.name === "MasterElected"
      );
      expect(event).to.not.be.undefined;
    });

    it("should record initial master heartbeat in mapping", async function () {
      const { heart } = await loadFixture(deployWithMasterFixture);
      const ts = await time.latest();
      expect(await heart.getNodeHeartbeat(MAC_A)).to.equal(ts);
    });

    it("should revert if heartbeatTimeout is zero", async function () {
      const [shared] = await ethers.getSigners();
      const ChainHeart = await ethers.getContractFactory("ChainHeart");
      await expect(
        ChainHeart.deploy(0, shared.address, "")
      ).to.be.revertedWithCustomError(ChainHeart, "InvalidTimeout");
    });

    it("should revert if sharedKeyAddress is zero address", async function () {
      const ChainHeart = await ethers.getContractFactory("ChainHeart");
      await expect(
        ChainHeart.deploy(TIMEOUT, ethers.ZeroAddress, "")
      ).to.be.revertedWithCustomError(ChainHeart, "ZeroAddress");
    });
  });

  // ---------------------------------------------------------------------------
  // State transitions
  // ---------------------------------------------------------------------------
  describe("State transitions", function () {
    it("should transition from Idle to Running on first election", async function () {
      const { heart } = await loadFixture(deployFixture);
      expect(await heart.getState()).to.equal(STATE_IDLE);
      await heart.electMaster(MAC_A);
      expect(await heart.getState()).to.equal(STATE_RUNNING);
    });

    it("should transition from Running to Election when master times out", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      expect(await heart.getState()).to.equal(STATE_RUNNING);
      await time.increase(TIMEOUT + 1);
      expect(await heart.getState()).to.equal(STATE_ELECTION);
    });

    it("should transition from Election to Running on new election", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      await time.increase(TIMEOUT + 1);
      expect(await heart.getState()).to.equal(STATE_ELECTION);
      await heart.electMaster(MAC_B);
      expect(await heart.getState()).to.equal(STATE_RUNNING);
    });

    it("should stay Running while master heartbeats within timeout", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      for (let i = 0; i < 5; i++) {
        await time.increase(TIMEOUT - 10);
        await heart.sendHeartbeat(MAC_A);
        expect(await heart.getState()).to.equal(STATE_RUNNING);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // electMaster
  // ---------------------------------------------------------------------------
  describe("electMaster", function () {
    it("should elect the first master when no master exists", async function () {
      const { heart } = await loadFixture(deployFixture);
      await expect(heart.electMaster(MAC_A))
        .to.emit(heart, "MasterElected");

      const [mac, , alive] = await heart.getCurrentMaster();
      expect(mac).to.equal(MAC_A);
      expect(alive).to.equal(true);
    });

    it("should reject election when current master is still alive", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      await expect(heart.electMaster(MAC_B))
        .to.be.revertedWithCustomError(heart, "MasterStillAlive");
    });

    it("should allow election after master times out", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      await time.increase(TIMEOUT + 1);

      await expect(heart.electMaster(MAC_B))
        .to.emit(heart, "MasterElected");

      const [mac] = await heart.getCurrentMaster();
      expect(mac).to.equal(MAC_B);
    });

    it("should reject empty MAC address", async function () {
      const { heart } = await loadFixture(deployFixture);
      await expect(heart.electMaster(""))
        .to.be.revertedWithCustomError(heart, "EmptyMAC");
    });

    it("should reject call from non-shared-key address", async function () {
      const { heart, stranger } = await loadFixture(deployFixture);
      await expect(heart.connect(stranger).electMaster(MAC_A))
        .to.be.revertedWithCustomError(heart, "Unauthorized");
    });

    it("should record heartbeat in mapping on election", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      const ts = await time.latest();
      expect(await heart.getNodeHeartbeat(MAC_A)).to.equal(ts);
    });

    it("should update currentMasterHash on election", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      const hash = ethers.keccak256(ethers.toUtf8Bytes(MAC_A));
      expect(await heart.currentMasterHash()).to.equal(hash);
    });

    it("should allow same node to re-elect after timeout", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      await time.increase(TIMEOUT + 1);
      await expect(heart.electMaster(MAC_A))
        .to.emit(heart, "MasterElected");
    });

    it("should guarantee only the first election succeeds when master is down", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      await time.increase(TIMEOUT + 1);

      await heart.electMaster(MAC_B);

      await expect(heart.electMaster(MAC_C))
        .to.be.revertedWithCustomError(heart, "MasterStillAlive");

      const [mac] = await heart.getCurrentMaster();
      expect(mac).to.equal(MAC_B);
    });
  });

  // ---------------------------------------------------------------------------
  // sendHeartbeat
  // ---------------------------------------------------------------------------
  describe("sendHeartbeat", function () {
    it("should allow the current master to send heartbeat", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      await expect(heart.sendHeartbeat(MAC_A))
        .to.emit(heart, "Heartbeat");
    });

    it("should update heartbeat timestamp in mapping", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      await time.increase(100);
      await heart.sendHeartbeat(MAC_A);
      const ts = await time.latest();
      expect(await heart.getNodeHeartbeat(MAC_A)).to.equal(ts);
    });

    it("should revert if no master is elected", async function () {
      const { heart } = await loadFixture(deployFixture);
      await expect(heart.sendHeartbeat(MAC_A))
        .to.be.revertedWithCustomError(heart, "NoMasterElected");
    });

    it("should revert if MAC does not match current master", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      await expect(heart.sendHeartbeat(MAC_B))
        .to.be.revertedWithCustomError(heart, "OnlyMasterCanHeartbeat");
    });

    it("should revert if called by non-shared-key address", async function () {
      const { heart, stranger } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      await expect(heart.connect(stranger).sendHeartbeat(MAC_A))
        .to.be.revertedWithCustomError(heart, "Unauthorized");
    });

    it("should keep master alive when heartbeats are sent regularly", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      for (let i = 0; i < 5; i++) {
        await time.increase(TIMEOUT - 10);
        await heart.sendHeartbeat(MAC_A);
        expect(await heart.isAlive()).to.equal(true);
      }
    });

    it("should emit correct block number in Heartbeat event", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      const tx = await heart.sendHeartbeat(MAC_A);
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (log) => heart.interface.parseLog(log)?.name === "Heartbeat"
      );
      const parsed = heart.interface.parseLog(event);
      expect(parsed.args.blockNumber).to.equal(receipt.blockNumber);
    });

    it("should work immediately after deploy with initial master", async function () {
      const { heart } = await loadFixture(deployWithMasterFixture);
      await expect(heart.sendHeartbeat(MAC_A))
        .to.emit(heart, "Heartbeat");
    });
  });

  // ---------------------------------------------------------------------------
  // isAlive
  // ---------------------------------------------------------------------------
  describe("isAlive", function () {
    it("should return false when no master is elected", async function () {
      const { heart } = await loadFixture(deployFixture);
      expect(await heart.isAlive()).to.equal(false);
    });

    it("should return true right after election", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      expect(await heart.isAlive()).to.equal(true);
    });

    it("should return true within timeout window", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      await time.increase(TIMEOUT - 10);
      expect(await heart.isAlive()).to.equal(true);
    });

    it("should return true at exact timeout boundary", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      await time.increase(TIMEOUT);
      expect(await heart.isAlive()).to.equal(true);
    });

    it("should return false after timeout", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      await time.increase(TIMEOUT + 1);
      expect(await heart.isAlive()).to.equal(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getNodeHeartbeat
  // ---------------------------------------------------------------------------
  describe("getNodeHeartbeat", function () {
    it("should return 0 for unknown node", async function () {
      const { heart } = await loadFixture(deployFixture);
      expect(await heart.getNodeHeartbeat(MAC_A)).to.equal(0);
    });

    it("should return correct timestamp after election", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      const ts = await time.latest();
      expect(await heart.getNodeHeartbeat(MAC_A)).to.equal(ts);
    });

    it("should return correct timestamp after heartbeat", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      await time.increase(500);
      await heart.sendHeartbeat(MAC_A);
      const ts = await time.latest();
      expect(await heart.getNodeHeartbeat(MAC_A)).to.equal(ts);
    });

    it("should track heartbeats independently per node", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      const tsA = await time.latest();

      await time.increase(TIMEOUT + 1);
      await heart.electMaster(MAC_B);
      const tsB = await time.latest();

      expect(await heart.getNodeHeartbeat(MAC_A)).to.equal(tsA);
      expect(await heart.getNodeHeartbeat(MAC_B)).to.equal(tsB);
    });
  });

  // ---------------------------------------------------------------------------
  // getCurrentMaster
  // ---------------------------------------------------------------------------
  describe("getCurrentMaster", function () {
    it("should return empty state initially", async function () {
      const { heart } = await loadFixture(deployFixture);
      const [mac, heartbeat, alive] = await heart.getCurrentMaster();
      expect(mac).to.equal("");
      expect(heartbeat).to.equal(0);
      expect(alive).to.equal(false);
    });

    it("should return correct master info after election", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      const [mac, heartbeat, alive] = await heart.getCurrentMaster();
      expect(mac).to.equal(MAC_A);
      expect(heartbeat).to.be.gt(0);
      expect(alive).to.equal(true);
    });

    it("should reflect updated master after failover", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      await time.increase(TIMEOUT + 1);
      await heart.electMaster(MAC_B);

      const [mac, , alive] = await heart.getCurrentMaster();
      expect(mac).to.equal(MAC_B);
      expect(alive).to.equal(true);
    });
  });

  // ---------------------------------------------------------------------------
  // setHeartbeatTimeout
  // ---------------------------------------------------------------------------
  describe("setHeartbeatTimeout", function () {
    it("should update timeout value", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.setHeartbeatTimeout(7200);
      expect(await heart.heartbeatTimeout()).to.equal(7200);
    });

    it("should emit HeartbeatTimeoutUpdated event", async function () {
      const { heart } = await loadFixture(deployFixture);
      await expect(heart.setHeartbeatTimeout(7200))
        .to.emit(heart, "HeartbeatTimeoutUpdated")
        .withArgs(TIMEOUT, 7200);
    });

    it("should revert if timeout is zero", async function () {
      const { heart } = await loadFixture(deployFixture);
      await expect(heart.setHeartbeatTimeout(0))
        .to.be.revertedWithCustomError(heart, "InvalidTimeout");
    });

    it("should revert if called by non-shared-key address", async function () {
      const { heart, stranger } = await loadFixture(deployFixture);
      await expect(
        heart.connect(stranger).setHeartbeatTimeout(7200)
      ).to.be.revertedWithCustomError(heart, "Unauthorized");
    });

    it("should affect isAlive after change", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      await time.increase(1800);
      expect(await heart.isAlive()).to.equal(true);

      await heart.setHeartbeatTimeout(600);
      expect(await heart.isAlive()).to.equal(false);
    });

    it("should affect getState after change", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      await time.increase(1800);
      expect(await heart.getState()).to.equal(STATE_RUNNING);

      await heart.setHeartbeatTimeout(600);
      expect(await heart.getState()).to.equal(STATE_ELECTION);
    });
  });

  // ---------------------------------------------------------------------------
  // Access control
  // ---------------------------------------------------------------------------
  describe("Access control", function () {
    it("should reject electMaster from unauthorized address", async function () {
      const { heart, stranger } = await loadFixture(deployFixture);
      await expect(heart.connect(stranger).electMaster(MAC_A))
        .to.be.revertedWithCustomError(heart, "Unauthorized");
    });

    it("should reject sendHeartbeat from unauthorized address", async function () {
      const { heart, stranger } = await loadFixture(deployWithMasterFixture);
      await expect(heart.connect(stranger).sendHeartbeat(MAC_A))
        .to.be.revertedWithCustomError(heart, "Unauthorized");
    });

    it("should reject setHeartbeatTimeout from unauthorized address", async function () {
      const { heart, stranger } = await loadFixture(deployFixture);
      await expect(heart.connect(stranger).setHeartbeatTimeout(100))
        .to.be.revertedWithCustomError(heart, "Unauthorized");
    });

    it("should allow shared key address to call all write functions", async function () {
      const { heart } = await loadFixture(deployFixture);
      await expect(heart.electMaster(MAC_A)).to.not.be.reverted;
      await expect(heart.sendHeartbeat(MAC_A)).to.not.be.reverted;
      await expect(heart.setHeartbeatTimeout(7200)).to.not.be.reverted;
    });
  });

  // ---------------------------------------------------------------------------
  // Election safety
  // ---------------------------------------------------------------------------
  describe("Election safety", function () {
    it("should only allow the first election to succeed when master is down", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      await time.increase(TIMEOUT + 1);

      await heart.electMaster(MAC_B);
      expect(await heart.getState()).to.equal(STATE_RUNNING);

      await expect(heart.electMaster(MAC_C))
        .to.be.revertedWithCustomError(heart, "MasterStillAlive");

      const [mac] = await heart.getCurrentMaster();
      expect(mac).to.equal(MAC_B);
    });

    it("should not allow election while master sends regular heartbeats", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);

      for (let i = 0; i < 5; i++) {
        await time.increase(TIMEOUT / 2);
        await heart.sendHeartbeat(MAC_A);
        await expect(heart.electMaster(MAC_B))
          .to.be.revertedWithCustomError(heart, "MasterStillAlive");
      }
    });

    it("should allow election immediately in Idle state", async function () {
      const { heart } = await loadFixture(deployFixture);
      expect(await heart.getState()).to.equal(STATE_IDLE);
      await heart.electMaster(MAC_A);
      expect(await heart.getState()).to.equal(STATE_RUNNING);
    });

    it("should preserve previous master heartbeat data after failover", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      const tsA = await time.latest();

      await time.increase(TIMEOUT + 1);
      await heart.electMaster(MAC_B);

      expect(await heart.getNodeHeartbeat(MAC_A)).to.equal(tsA);
    });
  });

  // ---------------------------------------------------------------------------
  // Full failover scenario
  // ---------------------------------------------------------------------------
  describe("Full failover scenario", function () {
    it("should complete a full A -> B -> C failover cycle with state checks", async function () {
      const { heart } = await loadFixture(deployFixture);
      expect(await heart.getState()).to.equal(STATE_IDLE);

      await heart.electMaster(MAC_A);
      let [mac, , alive] = await heart.getCurrentMaster();
      expect(mac).to.equal(MAC_A);
      expect(alive).to.equal(true);
      expect(await heart.getState()).to.equal(STATE_RUNNING);

      await time.increase(300);
      await heart.sendHeartbeat(MAC_A);
      expect(await heart.isAlive()).to.equal(true);

      await time.increase(TIMEOUT + 1);
      expect(await heart.isAlive()).to.equal(false);
      expect(await heart.getState()).to.equal(STATE_ELECTION);

      await heart.electMaster(MAC_B);
      [mac, , alive] = await heart.getCurrentMaster();
      expect(mac).to.equal(MAC_B);
      expect(alive).to.equal(true);
      expect(await heart.getState()).to.equal(STATE_RUNNING);

      await time.increase(300);
      await heart.sendHeartbeat(MAC_B);

      await time.increase(TIMEOUT + 1);
      expect(await heart.isAlive()).to.equal(false);
      expect(await heart.getState()).to.equal(STATE_ELECTION);

      await heart.electMaster(MAC_C);
      [mac, , alive] = await heart.getCurrentMaster();
      expect(mac).to.equal(MAC_C);
      expect(alive).to.equal(true);
      expect(await heart.getState()).to.equal(STATE_RUNNING);
    });

    it("should prevent non-master from sending heartbeat after failover", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      await time.increase(TIMEOUT + 1);
      await heart.electMaster(MAC_B);

      await expect(heart.sendHeartbeat(MAC_A))
        .to.be.revertedWithCustomError(heart, "OnlyMasterCanHeartbeat");
    });

    it("should support failover from initial master set in constructor", async function () {
      const { heart } = await loadFixture(deployWithMasterFixture);
      expect(await heart.getState()).to.equal(STATE_RUNNING);

      await time.increase(TIMEOUT + 1);
      expect(await heart.getState()).to.equal(STATE_ELECTION);

      await heart.electMaster(MAC_B);
      const [mac, , alive] = await heart.getCurrentMaster();
      expect(mac).to.equal(MAC_B);
      expect(alive).to.equal(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------
  describe("Edge cases", function () {
    it("should handle very long MAC address strings", async function () {
      const { heart } = await loadFixture(deployFixture);
      const longMAC = "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";
      await heart.electMaster(longMAC);
      const [mac] = await heart.getCurrentMaster();
      expect(mac).to.equal(longMAC);
    });

    it("should handle heartbeat timeout of 1 second", async function () {
      const [shared] = await ethers.getSigners();
      const ChainHeart = await ethers.getContractFactory("ChainHeart");
      const heart = await ChainHeart.deploy(1, shared.address, "");

      await heart.electMaster(MAC_A);
      expect(await heart.isAlive()).to.equal(true);

      await time.increase(2);
      expect(await heart.isAlive()).to.equal(false);
    });

    it("should handle rapid sequential elections after timeouts", async function () {
      const [shared] = await ethers.getSigners();
      const ChainHeart = await ethers.getContractFactory("ChainHeart");
      const heart = await ChainHeart.deploy(5, shared.address, "");

      await heart.electMaster(MAC_A);
      await time.increase(6);

      await heart.electMaster(MAC_B);
      await time.increase(6);

      await heart.electMaster(MAC_C);
      const [mac] = await heart.getCurrentMaster();
      expect(mac).to.equal(MAC_C);
    });

    it("should handle many heartbeats without issue", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);

      for (let i = 0; i < 20; i++) {
        await time.increase(60);
        await heart.sendHeartbeat(MAC_A);
      }
      expect(await heart.isAlive()).to.equal(true);
    });

    it("should handle re-election of the same node after timeout", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      const ts1 = await time.latest();

      await time.increase(TIMEOUT + 1);
      await heart.electMaster(MAC_A);
      const ts2 = await time.latest();

      expect(await heart.getNodeHeartbeat(MAC_A)).to.equal(ts2);
      expect(ts2).to.be.gt(ts1);
    });

    it("should correctly track state through multiple full cycles", async function () {
      const [shared] = await ethers.getSigners();
      const ChainHeart = await ethers.getContractFactory("ChainHeart");
      const heart = await ChainHeart.deploy(10, shared.address, "");

      expect(await heart.getState()).to.equal(STATE_IDLE);

      await heart.electMaster(MAC_A);
      expect(await heart.getState()).to.equal(STATE_RUNNING);
      await time.increase(11);
      expect(await heart.getState()).to.equal(STATE_ELECTION);

      await heart.electMaster(MAC_B);
      expect(await heart.getState()).to.equal(STATE_RUNNING);
      await heart.sendHeartbeat(MAC_B);
      expect(await heart.getState()).to.equal(STATE_RUNNING);
      await time.increase(11);
      expect(await heart.getState()).to.equal(STATE_ELECTION);

      await heart.electMaster(MAC_C);
      expect(await heart.getState()).to.equal(STATE_RUNNING);
    });

    it("should reject heartbeat from old master after new election", async function () {
      const { heart } = await loadFixture(deployFixture);
      await heart.electMaster(MAC_A);
      await time.increase(TIMEOUT + 1);
      await heart.electMaster(MAC_B);

      await expect(heart.sendHeartbeat(MAC_A))
        .to.be.revertedWithCustomError(heart, "OnlyMasterCanHeartbeat");
      await expect(heart.sendHeartbeat(MAC_B))
        .to.emit(heart, "Heartbeat");
    });
  });
});
