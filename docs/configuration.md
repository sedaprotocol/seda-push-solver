# Configuration Documentation

## Environment Variables

### SEDA Configuration
- `SEDA_RPC_ENDPOINT` - SEDA network RPC endpoint (default: https://rpc.testnet.seda.xyz)
- `SEDA_NETWORK` - Network type: testnet, mainnet, or local (default: testnet)
- `SEDA_MNEMONIC` - Wallet mnemonic for signing transactions

### Scheduler Configuration
- `SCHEDULER_INTERVAL_MS` - Interval between DataRequests in milliseconds (default: 30000)
- `SCHEDULER_CONTINUOUS` - Whether to run continuously (default: false)
- `SCHEDULER_MAX_RETRIES` - Maximum retry attempts for failed requests (default: 3)
- `SCHEDULER_MEMO` - Custom memo for DataRequests (default: "SEDA DataRequest")

### Cosmos Sequence Coordinator Configuration
- `COSMOS_POSTING_TIMEOUT_MS` - Timeout for posting DataRequest transactions (default: 20000ms)
- `COSMOS_DEFAULT_TIMEOUT_MS` - Default timeout for sequence coordinator operations (default: 60000ms)
- `COSMOS_MAX_QUEUE_SIZE` - Maximum number of requests in sequence queue (default: 100)

## Configuration Details

### Cosmos Sequence Timeouts

The cosmos sequence coordinator manages timeouts for different phases:

1. **Posting Timeout** (`COSMOS_POSTING_TIMEOUT_MS`): 
   - Time allowed for posting a DataRequest transaction to the blockchain
   - Should be relatively short (10-30 seconds)
   - Affects how quickly the queue moves

2. **Default Timeout** (`COSMOS_DEFAULT_TIMEOUT_MS`):
   - Fallback timeout for operations that don't specify their own timeout
   - Used for internal coordinator operations
   - Should be longer than posting timeout

3. **Max Queue Size** (`COSMOS_MAX_QUEUE_SIZE`):
   - Maximum number of DataRequests that can wait in the sequence queue
   - Prevents memory issues during high load
   - Requests will be rejected if queue is full

### Recommended Values

For production use:
```bash
COSMOS_POSTING_TIMEOUT_MS=20000    # 20 seconds
COSMOS_DEFAULT_TIMEOUT_MS=60000    # 60 seconds  
COSMOS_MAX_QUEUE_SIZE=100          # 100 requests
```

For development/testing:
```bash
COSMOS_POSTING_TIMEOUT_MS=10000    # 10 seconds
COSMOS_DEFAULT_TIMEOUT_MS=30000    # 30 seconds
COSMOS_MAX_QUEUE_SIZE=50           # 50 requests
```