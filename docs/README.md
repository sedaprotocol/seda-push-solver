# SEDA DataRequest Pusher & Scheduler - Documentation

A comprehensive TypeScript library for posting and scheduling DataRequests to the SEDA oracle network.

## ✅ **Status: Production Ready**

This project has been thoroughly tested against the SEDA testnet with successful DataRequest posting and automated scheduling capabilities.

## Overview

This project provides:
- **Generic DataRequest posting** - Works with any SEDA Oracle Program
- **Automated scheduling** - Continuous DataRequest posting at intervals
- **Multi-network support** - Testnet, mainnet, and local development
- **Retry logic and error handling** - Robust failure handling
- **Statistics and monitoring** - Track success rates and performance
- **Environment-based configuration** - Easy deployment setup

## Prerequisites

- **Node.js** v18 or higher
- **Bun** runtime
- **SEDA Account** with network tokens
- **Oracle Program** deployed to SEDA network

## Installation

```bash
# Install dependencies
bun install

# Set up environment
cp env.example .env
# Edit .env with your configuration
```

## Configuration

### Environment Variables

Create a `.env` file with your configuration:

```bash
# SEDA Network Configuration
SEDA_NETWORK=testnet                    # testnet, mainnet, or local
SEDA_MNEMONIC="your 24-word mnemonic"   # Your SEDA wallet mnemonic
SEDA_RPC_ENDPOINT=                      # Optional: custom RPC endpoint

# Scheduler Configuration (optional)
SCHEDULER_INTERVAL_SECONDS=60           # Interval between DataRequests
SCHEDULER_MEMO="Custom memo text"       # Custom memo for DataRequests
```

### Network Configuration

Edit `src/seda-dr-config.ts` to configure Oracle Program IDs:

```typescript
export const SEDA_NETWORK_CONFIGS = {
  testnet: {
    rpcEndpoint: 'https://rpc.testnet.seda.xyz',
    network: 'testnet',
    dataRequest: {
      oracleProgramId: 'your-oracle-program-id', // Set your Oracle Program ID
      replicationFactor: 1,
      execGasLimit: 150_000_000_000_000,
      gasPrice: 10000n,
      consensusOptions: { method: 'none' },
      timeoutSeconds: 60,
      pollingIntervalSeconds: 1,
      memo: 'Data request via SEDA'
    }
  },
  // ... other networks
};
```

## API Reference

### SEDADataRequestBuilder

Main class for posting DataRequests to the SEDA network.

#### Constructor

```typescript
const builder = new SEDADataRequestBuilder(config: SEDAConfig);
```

#### Methods

- `initialize(): Promise<void>` - Initialize signing configuration
- `postDataRequest(options?: DataRequestOptions): Promise<DataRequestResult>` - Post a DataRequest
- `getConfig(): SEDAConfig` - Get current configuration
- `isBuilderInitialized(): boolean` - Check initialization status

#### Example Usage

```typescript
import { SEDADataRequestBuilder, loadSEDAConfig } from './src';

// Load configuration from environment
const config = loadSEDAConfig();

// Create and initialize builder
const builder = new SEDADataRequestBuilder(config);
await builder.initialize();

// Post a DataRequest
const result = await builder.postDataRequest({
  memo: 'My custom DataRequest',
  customTimeout: 120 // Custom timeout in seconds
});

console.log('DataRequest ID:', result.drId);
console.log('Exit Code:', result.exitCode);
console.log('Block Height:', result.blockHeight);
console.log('Gas Used:', result.gasUsed);
```

### SEDADataRequestScheduler

Class for automated scheduling of DataRequests.

#### Constructor

```typescript
const scheduler = new SEDADataRequestScheduler(config?: Partial<SchedulerConfig>);
```

#### Methods

- `initialize(): Promise<void>` - Initialize the scheduler
- `start(): Promise<void>` - Start the scheduler
- `stop(): void` - Stop the scheduler
- `getStats()` - Get current statistics
- `isSchedulerRunning(): boolean` - Check if running

#### Example Usage

```typescript
import { SEDADataRequestScheduler } from './src';

// Create scheduler with custom configuration
const scheduler = new SEDADataRequestScheduler({
  intervalMs: 30000,    // 30 seconds between requests
  continuous: true,     // Run continuously
  maxRetries: 3,        // Maximum retry attempts
  memo: 'Scheduled DataRequest'
});

// Initialize and start
await scheduler.initialize();
await scheduler.start();

// The scheduler will now post DataRequests every 30 seconds
// Use Ctrl+C to stop gracefully
```

### Configuration Interfaces

#### SEDAConfig

```typescript
interface SEDAConfig {
  rpcEndpoint: string;                    // SEDA RPC endpoint
  network: 'testnet' | 'mainnet' | 'local';
  mnemonic?: string;                      // Wallet mnemonic
}
```

#### SEDADataRequestConfig

```typescript
interface SEDADataRequestConfig {
  oracleProgramId: string;                // Oracle Program ID
  replicationFactor: number;              // Number of replications
  gasPrice: bigint;                       // Gas price
  execGasLimit: number;                   // Execution gas limit
  consensusOptions: { method: 'none' };   // Consensus configuration
  timeoutSeconds: number;                 // Request timeout
  pollingIntervalSeconds: number;         // Polling interval
  memo?: string;                          // Optional memo
}
```

#### SchedulerConfig

```typescript
interface SchedulerConfig {
  intervalMs: number;                     // Interval in milliseconds
  continuous: boolean;                    // Run continuously
  maxRetries: number;                     // Maximum retry attempts
  memo?: string;                          // Custom memo
}
```

#### DataRequestResult

```typescript
interface DataRequestResult {
  drId: string;                           // DataRequest ID
  exitCode: number;                       // Exit code
  result?: any;                           // Result data
  blockHeight?: number;                   // Block height
  gasUsed?: string;                       // Gas used
}
```

## Usage Examples

### Single DataRequest

```typescript
import { SEDADataRequestBuilder, loadSEDAConfig } from './src';

async function postSingleDataRequest() {
  try {
    const config = loadSEDAConfig();
    const builder = new SEDADataRequestBuilder(config);
    
    await builder.initialize();
    
    const result = await builder.postDataRequest({
      memo: 'Single DataRequest test'
    });
    
    console.log('Success! DR ID:', result.drId);
    console.log('Exit Code:', result.exitCode);
  } catch (error) {
    console.error('Failed:', error);
  }
}
```

### Continuous Scheduling

```typescript
import { startScheduler } from './src';

async function runScheduler() {
  try {
    // Start scheduler with environment configuration
    const scheduler = await startScheduler({
      intervalMs: 60000, // 1 minute intervals
      memo: 'Automated DataRequest'
    });
    
    console.log('Scheduler started successfully!');
    // Scheduler will run until process is terminated
  } catch (error) {
    console.error('Scheduler failed:', error);
  }
}
```

### Custom Network Configuration

```typescript
import { SEDADataRequestBuilder, createDataRequestConfig } from './src';

async function useCustomConfig() {
  const config = {
    rpcEndpoint: 'https://custom-rpc.example.com',
    network: 'testnet' as const,
    mnemonic: process.env.SEDA_MNEMONIC
  };
  
  const builder = new SEDADataRequestBuilder(config);
  await builder.initialize();
  
  const result = await builder.postDataRequest({
    memo: 'Custom configuration test',
    customTimeout: 180 // 3 minutes
  });
  
  console.log('Result:', result);
}
```

## Network Support

### Testnet (Default)
- **RPC**: `https://rpc.testnet.seda.xyz`
- **Explorer**: `https://testnet.explorer.seda.xyz/`
- **Faucet**: `https://faucet.testnet.seda.xyz/`
- **Gas Limit**: 150T (tested and working)

### Mainnet
- **RPC**: `https://rpc.seda.xyz`
- **Explorer**: `https://explorer.seda.xyz/`
- **Gas Limit**: 10T (conservative default)

### Local Development
- **RPC**: `http://localhost:26657`
- **Gas Limit**: 10T

## Gas Configuration

The project handles SEDA network gas requirements:

- **Minimum**: 10,000,000,000,000 (10 trillion)
- **Testnet default**: 150,000,000,000,000 (150 trillion)
- **Mainnet default**: 10,000,000,000,000 (10 trillion)

Gas limits can be adjusted in the network configuration based on Oracle Program complexity.

## Error Handling

The library provides comprehensive error handling:

- **Network connectivity errors** - Automatic retry with backoff
- **Insufficient gas errors** - Clear error messages with solutions
- **Mnemonic/authentication errors** - Setup guidance
- **Oracle Program errors** - Detailed error reporting
- **Timeout errors** - Configurable timeouts with retry logic

## Statistics and Monitoring

The scheduler provides detailed statistics:

```typescript
const stats = scheduler.getStats();

console.log('Total Requests:', stats.totalRequests);
console.log('Successful:', stats.successfulRequests);
console.log('Failed:', stats.failedRequests);
console.log('Success Rate:', (stats.successfulRequests / stats.totalRequests) * 100);
```

## CLI Usage

### Start Scheduler

```bash
# Start with default configuration
bun start

# Set environment variables
SCHEDULER_INTERVAL_SECONDS=30 bun start
```

### Run Single DataRequest

```bash
# Run demo
bun run demo

# Run with custom memo
SCHEDULER_MEMO="Test request" bun run demo
```

### Testing

```bash
# Test configuration
bun test

# Test DataRequest posting
bun run test:datarequest

# Test multiple DataRequests
bun run test:multiple

# Run all tests
bun run test:all
```

## Development

### Project Structure

```
src/
├── index.ts                  # Main exports
├── push-solver.ts            # DataRequest builder
├── seda-dr-config.ts         # Network configurations
├── scheduler.ts              # Scheduling functionality
├── runner.ts                 # CLI runner
└── helpers/
    └── hex-converter.ts      # Utility functions
```

### Adding New Networks

1. Edit `src/seda-dr-config.ts`
2. Add network configuration to `SEDA_NETWORK_CONFIGS`
3. Set appropriate RPC endpoint and Oracle Program ID
4. Configure gas limits and other parameters

### Testing Against New Oracle Programs

1. Deploy your Oracle Program to SEDA
2. Update the `oracleProgramId` in network configuration
3. Test with `bun run test:datarequest`
4. Verify results match expected Oracle Program behavior

## Production Deployment

### Environment Setup

1. **Secure mnemonic storage** - Use environment variables or secure vaults
2. **Network selection** - Use `SEDA_NETWORK=mainnet` for production
3. **Gas optimization** - Monitor gas usage and adjust limits
4. **Error monitoring** - Implement logging and alerting
5. **Process management** - Use PM2 or similar for daemon management

### Example Production Setup

```bash
# Production environment
export SEDA_NETWORK=mainnet
export SEDA_MNEMONIC="your-production-mnemonic"
export SCHEDULER_INTERVAL_SECONDS=300  # 5 minutes
export SCHEDULER_MEMO="Production DataRequest"

# Start with process manager
pm2 start "bun start" --name seda-pusher
```

## Troubleshooting

### Common Issues

1. **"Mnemonic is required"** - Set `SEDA_MNEMONIC` environment variable
2. **"Insufficient gas"** - Increase `execGasLimit` in configuration
3. **"Oracle Program ID not configured"** - Set Oracle Program ID in network config
4. **"Connection failed"** - Check RPC endpoint and network connectivity
5. **"Exit code 254"** - Oracle Program execution error (check Oracle Program logs)

### Getting Help

- Check the console logs for detailed error messages
- Verify Oracle Program deployment and functionality
- Test with smaller gas limits first
- Use testnet for development and testing

## Resources

- [SEDA Documentation](https://docs.seda.xyz/)
- [SEDA SDK Repository](https://github.com/sedaprotocol/seda-sdk)
- [SEDA Testnet Explorer](https://testnet.explorer.seda.xyz/)
- [SEDA Discord Community](https://discord.gg/seda)

## Contributing

Feel free to submit issues and pull requests to improve this SEDA DataRequest pusher library.

## License

This project was created using `bun init` in bun v1.2.9. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
