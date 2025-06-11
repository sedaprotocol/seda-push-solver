# Configuration Documentation

## Environment Variables

### SEDA Configuration
- `SEDA_RPC_ENDPOINT` - SEDA network RPC endpoint (default: https://rpc.testnet.seda.xyz)
- `SEDA_NETWORK` - Network type: testnet, mainnet, or local (default: testnet)
- `SEDA_MNEMONIC` - Wallet mnemonic for signing transactions (required)
- `SEDA_ORACLE_PROGRAM_ID` - Oracle Program ID for DataRequests (required)
- `SEDA_REPLICATION_FACTOR` - Number of replications for DataRequests (default: 1 for testnet/local, 2 for mainnet)

### Scheduler Configuration
- `SCHEDULER_INTERVAL_MS` - Interval between DataRequests in milliseconds (default: 30000)
- `SCHEDULER_CONTINUOUS` - Whether to run continuously (default: false)
- `SCHEDULER_MAX_RETRIES` - Maximum retry attempts for failed requests (default: 3)
- `SCHEDULER_MEMO` - Custom memo for DataRequests (default: "SEDA DataRequest")

### Cosmos Sequence Coordinator Configuration
- `COSMOS_POSTING_TIMEOUT_MS` - Timeout for posting DataRequest transactions (default: 20000ms)
- `COSMOS_MAX_QUEUE_SIZE` - Maximum number of requests in sequence queue (default: 100)

### DataRequest Network Configuration
- `SEDA_DR_TIMEOUT_SECONDS` - Timeout for DataRequest execution in seconds (default: 120s for testnet/mainnet, 60s for local)
- `SEDA_DR_POLLING_INTERVAL_SECONDS` - Polling interval for checking results in seconds (default: 1s for testnet, 5s for mainnet, 3s for local)

## Configuration Details

### Cosmos Sequence Timeouts

The cosmos sequence coordinator manages timeouts for different phases:

1. **Posting Timeout** (`COSMOS_POSTING_TIMEOUT_MS`): 
   - Time allowed for posting a DataRequest transaction to the blockchain
   - Should be relatively short (10-30 seconds)
   - Affects how quickly the queue moves

2. **DataRequest Result Timeout** (`SEDA_DR_TIMEOUT_SECONDS`):
   - Timeout for awaiting DataRequest execution results
   - Used both for network operations and sequence coordination
   - Should be longer than posting timeout to allow time for oracle execution

3. **Max Queue Size** (`COSMOS_MAX_QUEUE_SIZE`):
   - Maximum number of DataRequests that can wait in the sequence queue
   - Prevents memory issues during high load
   - Requests will be rejected if queue is full

### Recommended Values

For production use:
```bash
# Sequence Coordinator
COSMOS_POSTING_TIMEOUT_MS=20000         # 20 seconds for posting transactions
COSMOS_MAX_QUEUE_SIZE=100               # 100 requests

# DataRequest Configuration (shared between network and sequence coordinator)
SEDA_DR_TIMEOUT_SECONDS=120             # 120 seconds DataRequest execution timeout
SEDA_DR_POLLING_INTERVAL_SECONDS=5      # 5 seconds polling interval
```

For development/testing:
```bash
# Sequence Coordinator
COSMOS_POSTING_TIMEOUT_MS=10000         # 10 seconds for posting transactions
COSMOS_MAX_QUEUE_SIZE=50                # 50 requests

# DataRequest Configuration (shared between network and sequence coordinator)
SEDA_DR_TIMEOUT_SECONDS=60              # 60 seconds DataRequest execution timeout
SEDA_DR_POLLING_INTERVAL_SECONDS=2      # 2 seconds polling interval
```