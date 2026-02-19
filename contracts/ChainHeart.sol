// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ChainHeart
 * @notice On-chain heartbeat registry and master election for a distributed node cluster.
 *         Nodes share the same private key (sharedKeyAddress) and use MAC addresses as
 *         unique identifiers.
 *
 *         Election safety: when the current master times out, any node can call
 *         electMaster(). The first transaction to be mined wins because it immediately
 *         records a heartbeat for the new master; subsequent election attempts see a
 *         live master and revert with MasterStillAlive.
 */
contract ChainHeart {

    enum State {
        Idle,
        Running,
        Election
    }

    string public currentMasterMAC;
    bytes32 public currentMasterHash;
    uint256 public heartbeatTimeout;
    address public sharedKeyAddress;

    mapping(bytes32 => uint256) public heartbeats;

    event Heartbeat(string indexed mac, uint256 timestamp, uint256 blockNumber);
    event MasterElected(string indexed newMasterMAC, uint256 timestamp);
    event HeartbeatTimeoutUpdated(uint256 oldTimeout, uint256 newTimeout);

    error NoMasterElected();
    error MasterStillAlive();
    error OnlyMasterCanHeartbeat();
    error InvalidTimeout();
    error EmptyMAC();
    error Unauthorized();
    error ZeroAddress();

    modifier onlySharedKey() {
        if (msg.sender != sharedKeyAddress) revert Unauthorized();
        _;
    }

    constructor(
        uint256 _heartbeatTimeout,
        address _sharedKeyAddress,
        string memory _initialMasterMAC
    ) {
        if (_heartbeatTimeout == 0) revert InvalidTimeout();
        if (_sharedKeyAddress == address(0)) revert ZeroAddress();

        heartbeatTimeout = _heartbeatTimeout;
        sharedKeyAddress = _sharedKeyAddress;

        if (bytes(_initialMasterMAC).length > 0) {
            bytes32 macHash = keccak256(bytes(_initialMasterMAC));
            currentMasterMAC = _initialMasterMAC;
            currentMasterHash = macHash;
            heartbeats[macHash] = block.timestamp;
            emit MasterElected(_initialMasterMAC, block.timestamp);
        }
    }

    /**
     * @notice Master node calls this periodically to prove liveness.
     * @param mac The MAC address of the calling node (must match current master).
     */
    function sendHeartbeat(string calldata mac) external onlySharedKey {
        if (currentMasterHash == bytes32(0)) revert NoMasterElected();

        bytes32 macHash = keccak256(bytes(mac));
        if (macHash != currentMasterHash) revert OnlyMasterCanHeartbeat();

        heartbeats[macHash] = block.timestamp;
        emit Heartbeat(mac, block.timestamp, block.number);
    }

    /**
     * @notice Elect a new master. Succeeds only when no master exists or the current
     *         master has timed out. The first transaction to be mined wins; subsequent
     *         callers see a live master and revert.
     * @param mac The MAC address of the node that wants to become master.
     */
    function electMaster(string calldata mac) external onlySharedKey {
        if (bytes(mac).length == 0) revert EmptyMAC();

        if (currentMasterHash != bytes32(0)) {
            if (block.timestamp - heartbeats[currentMasterHash] <= heartbeatTimeout)
                revert MasterStillAlive();
        }

        bytes32 macHash = keccak256(bytes(mac));
        currentMasterMAC = mac;
        currentMasterHash = macHash;
        heartbeats[macHash] = block.timestamp;
        emit MasterElected(mac, block.timestamp);
    }

    /**
     * @notice Update the heartbeat timeout threshold.
     * @param _timeout New timeout value in seconds.
     */
    function setHeartbeatTimeout(uint256 _timeout) external onlySharedKey {
        if (_timeout == 0) revert InvalidTimeout();
        uint256 oldTimeout = heartbeatTimeout;
        heartbeatTimeout = _timeout;
        emit HeartbeatTimeoutUpdated(oldTimeout, _timeout);
    }

    /**
     * @notice Derive the current contract state from on-chain data.
     */
    function getState() public view returns (State) {
        if (currentMasterHash == bytes32(0)) return State.Idle;
        if (block.timestamp - heartbeats[currentMasterHash] <= heartbeatTimeout)
            return State.Running;
        return State.Election;
    }

    /**
     * @notice Check whether the current master is still alive (within timeout).
     */
    function isAlive() public view returns (bool) {
        return getState() == State.Running;
    }

    /**
     * @notice Get the last heartbeat timestamp for a specific node.
     * @param mac The MAC address to query.
     */
    function getNodeHeartbeat(string calldata mac) external view returns (uint256) {
        return heartbeats[keccak256(bytes(mac))];
    }

    /**
     * @notice Get current master info.
     * @return mac The current master MAC address.
     * @return lastHeartbeat The last heartbeat timestamp of the master.
     * @return alive Whether the master is alive.
     */
    function getCurrentMaster()
        external
        view
        returns (string memory mac, uint256 lastHeartbeat, bool alive)
    {
        mac = currentMasterMAC;
        lastHeartbeat = heartbeats[currentMasterHash];
        alive = isAlive();
    }
}
