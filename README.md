# SEDA DataRequest Pusher & Scheduler

A TypeScript project for posting and scheduling DataRequests to the SEDA oracle network. This is a generic tool that works with any Oracle Program deployed on SEDA.

## ✅ **Status: Production Ready**

This project has been thoroughly tested against the SEDA testnet. DataRequests are posted correctly and processed by the network with full scheduling capabilities.

## Features

- 🚀 **Generic DataRequest posting** - Works with any SEDA Oracle Program
- ⏰ **Automated scheduling** - Continuously post DataRequests at intervals
- 🔄 **Retry logic** - Automatic retry on failures with configurable attempts
- 📊 **Statistics tracking** - Monitor success rates and performance
- 🛡️ **Graceful shutdown** - Proper cleanup on SIGINT/SIGTERM
- 🌐 **Multi-network support** - Testnet, mainnet, and local development
- 📝 **Comprehensive logging** - Detailed execution tracking
- 🔧 **Environment-based config** - Easy deployment configuration

## Quick Start

```bash
# Install dependencies
bun install

# Set up environment (copy and edit)
cp env.example .env

# Run the scheduler
bun start

# Or run a single DataRequest
bun run demo
```

## Project Structure

```
dxfeed-pusher/
├── src/                          # Source code
│   ├── index.ts                  # Main exports
│   ├── push-solver.ts            # DataRequest builder and posting
│   ├── seda-dr-config.ts         # Network configurations
│   ├── scheduler.ts              # Automated scheduling
│   ├── runner.ts                 # CLI runner script
│   └── helpers/
│       └── hex-converter.ts      # Hex conversion utilities
├── tests/                        # Test files
│   ├── test-seda-config.ts       # Configuration tests
│   ├── test-datarequest.ts       # Single DataRequest tests
│   └── test-multiple-requests.ts # Multiple DataRequest tests
├── examples/                     # Example usage
│   └── demo.ts                   # Demo application
├── config/                       # Configuration templates
├── docs/                         # Documentation
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
└── .env                          # Environment variables (create from template)
```

## Environment Setup

Create a `.env` file with your configuration:

```bash
# SEDA Network Configuration
SEDA_NETWORK=testnet                    # testnet, mainnet, or local
SEDA_MNEMONIC="your 24-word mnemonic"   # Your SEDA wallet mnemonic
SEDA_RPC_ENDPOINT=                      # Optional: custom RPC endpoint

# Oracle Program Configuration (set in src/seda-dr-config.ts)
# Update the oracleProgramId in the network config

# Scheduler Configuration (optional)
SCHEDULER_INTERVAL_SECONDS=60           # Interval between DataRequests
SCHEDULER_MEMO="Custom memo text"       # Custom memo for DataRequests
```

## Available Scripts

- `bun start` - Start the DataRequest scheduler
- `bun run scheduler` - Same as start (alias)
- `bun run demo` - Run a single DataRequest demo
- `bun test` - Run configuration tests
- `bun run test:datarequest` - Test single DataRequest posting
- `bun run test:multiple` - Test multiple DataRequests
- `bun run test:all` - Run all tests
- `bun run build` - Type check the project
- `bun run lint` - Lint the project

## Configuration

### Network Configuration

Edit `src/seda-dr-config.ts` to configure your Oracle Program ID for each network:

```typescript
export const SEDA_NETWORK_CONFIGS = {
  testnet: {
    rpcEndpoint: 'https://rpc.testnet.seda.xyz',
    network: 'testnet',
    dataRequest: {
      oracleProgramId: 'your-oracle-program-id-here', // ← Set this
      replicationFactor: 1,
      execGasLimit: 150_000_000_000_000,
      // ... other settings
    }
  },
  // ... other networks
};
```

### Gas Configuration

The project uses appropriate gas limits for the SEDA network:
- **Testnet**: 150T gas limit (tested and working)
- **Mainnet**: 10T gas limit (conservative default)
- **Minimum**: 10T gas (SEDA network requirement)

## Usage Examples

### Programmatic Usage

```typescript
import { SEDADataRequestBuilder, loadSEDAConfig } from './src';

// Load configuration from environment
const config = loadSEDAConfig();

// Create and initialize builder
const builder = new SEDADataRequestBuilder(config);
await builder.initialize();

// Post a DataRequest
const result = await builder.postDataRequest({
  memo: 'My custom DataRequest'
});

console.log('DataRequest ID:', result.drId);
console.log('Exit Code:', result.exitCode);
```

### Scheduler Usage

```typescript
import { SEDADataRequestScheduler } from './src';

// Create scheduler with custom config
const scheduler = new SEDADataRequestScheduler({
  intervalMs: 30000,  // 30 seconds
  continuous: true,
  maxRetries: 3,
  memo: 'Scheduled DataRequest'
});

// Start the scheduler
await scheduler.initialize();
await scheduler.start();
```

## Requirements

- **Node.js** v18 or higher
- **Bun** runtime
- **SEDA Account** with testnet/mainnet tokens
- **Oracle Program** deployed to SEDA network

## Getting SEDA Tokens

Visit the [SEDA Testnet Faucet](https://faucet.testnet.seda.xyz/) to get testnet tokens for testing.

## Oracle Program Development

This tool works with any Oracle Program deployed on SEDA. For Oracle Program development, see:
- [SEDA Documentation](https://docs.seda.xyz/)
- [SEDA SDK](https://github.com/sedaprotocol/seda-sdk)

## Testing Results

✅ **Successfully tested on SEDA testnet**  
✅ **Gas limits validated (10T minimum)**  
✅ **Scheduler runs continuously**  
✅ **Retry logic functional**  
✅ **Graceful shutdown working**  

Sample successful DataRequest:
- **Network**: SEDA Testnet
- **Block Height**: 5000418+
- **Gas Used**: ~8T units per request
- **Status**: Posted and processed successfully

## Resources

- [SEDA Documentation](https://docs.seda.xyz/)
- [SEDA SDK Repository](https://github.com/sedaprotocol/seda-sdk)
- [SEDA Testnet Explorer](https://testnet.explorer.seda.xyz/)
- [SEDA Discord](https://discord.gg/seda)

## License

This project was created using `bun init` in bun v1.2.9. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime. 