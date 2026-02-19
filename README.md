# ChainHeart - Blockchain-Based Distributed Heartbeat System

A decentralized master election system using an Ethereum smart contract as a trusted registry and heartbeat tracker. Nodes share a single private key and identify themselves by MAC address. The on-chain state drives automatic master election and failover.

## Architecture

```
+----------+  heartbeat / elect   +-------------------+
|  Node A  | ------------------->  |  ChainHeart.sol   |
| (master) | <-------------------  |  (on-chain state) |
+----------+   read state         +-------------------+
                                         ^  read state
+----------+                             |
|  Node B  | ----------------------------+
| (slave)  |   monitor & elect on timeout
+----------+
```

### Election Safety

When the current master times out, all slaves detect the `Election` state and attempt to call `electMaster()`. Blockchain transaction ordering guarantees that only the **first** transaction to be mined succeeds:

1. Slave B's tx is mined first: master timed out -> B becomes master, heartbeat recorded
2. Slave C's tx is mined second: new master B is alive -> reverts with `MasterStillAlive`

This ensures exactly one node becomes master without any off-chain coordination.

### State Machine

```
  [Idle] --electMaster()--> [Running] --timeout--> [Election]
                               ^                       |
                               +--- electMaster() -----+
```

- **Idle**: No master has been elected yet
- **Running**: A master is alive and sending heartbeats
- **Election**: Master has timed out, awaiting new election

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Compile contracts
npm run compile

# 3. Run tests
npm test

# 4. Start a local Hardhat node (terminal 1)
npm run node

# 5. Deploy to local node (terminal 2)
npm run deploy:local

# 6. Copy .env.example to .env, fill in CONTRACT_ADDRESS and PRIVATE_KEY

# 7. Start the client
npm run client
```

## Project Structure

```
contracts/
  ChainHeart.sol          # Smart contract
test/
  ChainHeart.test.js      # Comprehensive test suite
scripts/
  deploy.js               # Deployment script
client/
  index.js                # Node.js client daemon
hardhat.config.js
package.json
```

## Smart Contract

### Access Control

The contract uses a `sharedKeyAddress` instead of OpenZeppelin `Ownable`. All nodes share the same private key (whose address matches `sharedKeyAddress`), and only that address can call write functions. This avoids tying operations to the deployer and clearly separates the shared-key concept from ownership.

### State Variables

| Variable | Type | Description |
|---|---|---|
| `currentMasterMAC` | `string` | MAC address of the current master node |
| `currentMasterHash` | `bytes32` | Cached keccak256 hash of current master MAC (gas optimization) |
| `heartbeatTimeout` | `uint256` | Seconds before a master is considered dead |
| `sharedKeyAddress` | `address` | The shared key address authorized for all writes |
| `heartbeats` | `mapping(bytes32 => uint256)` | Per-node heartbeat timestamps (keyed by MAC hash) |

### Functions

| Function | Access | Description |
|---|---|---|
| `electMaster(mac)` | Shared key | Claim master role (only if Idle or Election state) |
| `sendHeartbeat(mac)` | Shared key | Renew liveness (current master only) |
| `setHeartbeatTimeout(t)` | Shared key | Update the timeout threshold |
| `getState()` | Public | Returns current state: Idle, Running, or Election |
| `isAlive()` | Public | Whether the master is within the timeout window |
| `getNodeHeartbeat(mac)` | Public | Last heartbeat timestamp for a specific node |
| `getCurrentMaster()` | Public | Returns `(mac, lastHeartbeat, isAlive)` |

### Constructor

```solidity
constructor(uint256 _heartbeatTimeout, address _sharedKeyAddress, string memory _initialMasterMAC)
```

- `_heartbeatTimeout`: Timeout in seconds (must be > 0)
- `_sharedKeyAddress`: Address authorized for all write operations (must be non-zero)
- `_initialMasterMAC`: Optional initial master MAC (pass empty string to start in Idle state)

### Events

| Event | Description |
|---|---|
| `Heartbeat(mac, timestamp, blockNumber)` | Emitted on each heartbeat |
| `MasterElected(newMasterMAC, timestamp)` | Emitted when a new master is elected |
| `HeartbeatTimeoutUpdated(old, new)` | Emitted when timeout is changed |

## Configuration (.env)

```env
PRIVATE_KEY=0x...                # Shared key
SEPOLIA_RPC_URL=https://...      # Or any EVM-compatible RPC
CONTRACT_ADDRESS=0x...           # Deployed contract address
HEARTBEAT_TIMEOUT=3600           # Seconds before master is dead (deploy-time)
INITIAL_MASTER_MAC=              # Optional initial master MAC (deploy-time)
CHECK_INTERVAL=30                # Seconds between status checks (client)
```

## Deployment

### Local (Hardhat Network)

```bash
npx hardhat node
npx hardhat run scripts/deploy.js --network localhost
```

### Sepolia Testnet

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

## Testing

```bash
npm test
```

The test suite covers:
- Deployment with and without initial master
- Constructor validation (zero timeout, zero address)
- State transitions (Idle -> Running -> Election -> Running)
- First election with no existing master
- Election rejection while master is alive
- Election after master timeout (failover)
- Election safety (only first election succeeds)
- Heartbeat sending and per-node timestamp mapping
- Per-node heartbeat tracking independence
- Heartbeat rejection for non-master MAC
- `isAlive` boundary conditions
- `getState` consistency across all transitions
- `setHeartbeatTimeout` and its effect on liveness and state
- Access control (sharedKeyAddress enforcement on all write functions)
- Full failover scenario (A -> B -> C) with state assertions
- Failover from constructor-initialized master
- Edge cases (long MAC, 1s timeout, rapid elections, many heartbeats, same-node re-election)

## Security Notes

- All write functions are restricted to the `sharedKeyAddress`.
- The shared private key must be stored securely (use env vars or a secrets manager).
- MAC addresses can be spoofed on a local machine; this design assumes trusted nodes.
- Gas costs apply to heartbeat and election transactions.
- Election atomicity is guaranteed by blockchain transaction ordering.
- `currentMasterHash` is cached to avoid repeated keccak256 computation on reads.
