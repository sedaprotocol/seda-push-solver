# DXFeed Pusher - SEDA DataRequest Configuration

A TypeScript project for configuring and posting DataRequests to the SEDA network for DXFeed financial data.

## ✅ **Status: Tested & Working**

This configuration has been successfully tested against the SEDA testnet. DataRequests are posted correctly and processed by the network.

## Overview

This project demonstrates how to:
- Configure SEDA TypeScript SDK for DataRequest operations
- Set up DataRequest configurations for financial data (DXFeed)
- Post DataRequests to the SEDA network using Oracle Programs
- Handle different data types (price, quote, trade, candles, etc.)

## Prerequisites

- **Node.js** v18 or higher
- **Bun** runtime
- **SEDA Account** with testnet tokens
- **Oracle Program** deployed to SEDA network

## Installation

```bash
# Clone and setup the project
bun install
```

## Configuration

### Environment Setup

1. Create your environment file:
```bash
# Create .env file with your configuration
cat > .env << 'EOF'
# SEDA Network Configuration
SEDA_RPC_ENDPOINT=https://rpc.testnet.seda.xyz
SEDA_MNEMONIC="your 24-word mnemonic phrase here"
ORACLE_PROGRAM_ID="your-deployed-oracle-program-id"

# Optional DXFeed Configuration
DXFEED_API_KEY="your-dxfeed-api-key"
DXFEED_ENDPOINT="https://tools.dxfeed.com/webservice/rest"
EOF
```

### SEDA Network Options

The configuration supports multiple SEDA networks:

- **Testnet**: `https://rpc.testnet.seda.xyz` (default)
- **Mainnet**: `https://rpc.seda.xyz`
- **Local**: `http://localhost:26657`

## Usage

### Basic Demo

Run the configuration demo:
```bash
bun run index.ts
```

This will:
- Test the SEDA configuration setup
- Display available networks
- Show example DataRequest configurations
- Provide next steps for deployment

### Testing Configuration

Test just the configuration structure:
```bash
bun run test-seda-config.ts
```

### Testing DataRequest Posting

Test the complete DataRequest posting functionality:
```bash
bun run test-datarequest.ts
```

This will validate:
- DataRequest structure correctness
- SEDA SDK integration
- Network connectivity
- Transaction posting (with proper credentials)

### Creating DataRequests

```typescript
import { loadSEDAConfig, SEDADataRequestBuilder } from './seda-config';

// Load configuration from environment
const config = loadSEDAConfig();

// Create DataRequest configurations
const priceRequest = SEDADataRequestBuilder.createPriceDataRequest(
  'AAPL',
  'your-oracle-program-id',
  {
    memo: 'Apple stock price request',
    timeout: 30000
  }
);

const quoteRequest = SEDADataRequestBuilder.createQuoteDataRequest(
  'GOOGL',
  'your-oracle-program-id'
);

const tradeRequest = SEDADataRequestBuilder.createTradeDataRequest(
  'TSLA',
  'your-oracle-program-id',
  {
    timeout: 60000
  }
);
```

### Posting DataRequests

```typescript
// Initialize the DataRequest builder
const builder = new SEDADataRequestBuilder(config);
await builder.initialize();

// Post a DataRequest
const result = await builder.postDataRequest(priceRequest);
console.log('DataRequest result:', result);
```

## DataRequest Types

The configuration supports various DXFeed data types:

- **`price`** - Current price data
- **`quote`** - Bid/ask quote data  
- **`trade`** - Trade execution data
- **`candle`** - OHLCV candle data
- **`greeks`** - Options Greeks data
- **`profile`** - Instrument profile data

## Important Configuration Notes

### Gas Limits
- **Minimum execution gas**: 10,000,000,000,000 (10 trillion)
- Default configuration uses the minimum required amount
- Adjust `gasLimit` in DataRequest config if needed for complex operations

### Consensus Options
- Currently configured for `method: 'none'` (all results valid)
- Can be modified to use `mode` consensus with proper `jsonPath` configuration

## File Structure

```
dxfeed-pusher/
├── seda-config.ts          # Main SEDA configuration and builder
├── test-seda-config.ts     # Configuration testing utilities
├── test-datarequest.ts     # DataRequest posting tests
├── index.ts                # Demo application
├── .env                    # Environment configuration (create from template)
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
└── README.md               # This documentation
```

## API Reference

### SEDADataRequestBuilder

Main class for building and posting DataRequests.

#### Methods

- `constructor(config: SEDAConfig)` - Initialize with SEDA configuration
- `initialize(): Promise<void>` - Setup signer for transactions
- `postDataRequest(config: DXFeedDataRequestConfig): Promise<any>` - Post a DataRequest

#### Static Factory Methods

- `createPriceDataRequest(symbol, oracleProgramId, overrides?)`
- `createQuoteDataRequest(symbol, oracleProgramId, overrides?)`
- `createTradeDataRequest(symbol, oracleProgramId, overrides?)`

### Configuration Interfaces

#### SEDAConfig
```typescript
interface SEDAConfig {
  rpcEndpoint: string;
  mnemonic?: string;
  oracleProgramId?: string;
  network: 'testnet' | 'mainnet' | 'local';
}
```

#### DXFeedDataRequestConfig
```typescript
interface DXFeedDataRequestConfig {
  oracleProgramId: string;
  symbol: string;
  dataType: 'price' | 'quote' | 'trade' | 'candle' | 'greeks' | 'profile';
  consensusOptions: { method: 'none' };
  gasLimit?: number; // Default: 10,000,000,000,000
  memo?: string;
  timeout?: number; // Milliseconds
  retryAttempts?: number;
}
```

## Getting Started with SEDA

### 1. Get Testnet Tokens

Visit the [SEDA Testnet Faucet](https://faucet.testnet.seda.xyz/) to get testnet tokens.

### 2. Deploy an Oracle Program

You'll need to deploy an Oracle Program that can fetch DXFeed data. See the [SEDA Documentation](https://docs.seda.xyz/) for Oracle Program development.

Example using SEDA CLI:
```bash
bunx seda-sdk oracle-program upload path/to/your/oracle-program.wasm
```

### 3. Configure Environment

Set your mnemonic and Oracle Program ID in the `.env` file.

### 4. Post DataRequests

Use the `SEDADataRequestBuilder` to post DataRequests to the network.

## Testing Results

✅ **Configuration tested successfully against SEDA testnet**
✅ **DataRequest structure validated**  
✅ **Gas limits confirmed (minimum: 10T units)**
✅ **Network integration working**

Sample successful DataRequest:
- **Network**: SEDA Testnet
- **Block Height**: 5000418
- **Gas Used**: ~8T units
- **Status**: Posted successfully

## Development

### Dependencies

- `@seda-protocol/dev-tools` - SEDA TypeScript SDK
- `typescript` - TypeScript support
- `@types/bun` - Bun runtime types

### Scripts

- `bun run index.ts` - Run the demo application
- `bun run test-seda-config.ts` - Test configuration only
- `bun run test-datarequest.ts` - Test DataRequest posting

## Resources

- [SEDA Documentation](https://docs.seda.xyz/)
- [SEDA SDK Repository](https://github.com/sedaprotocol/seda-sdk)
- [SEDA Testnet Explorer](https://testnet.explorer.seda.xyz/)
- [SEDA Discord](https://discord.gg/seda) 
- [DXFeed Documentation](https://kb.dxfeed.com/)

## License

This project was created using `bun init` in bun v1.2.9. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

## Contributing

Feel free to submit issues and pull requests to improve this SEDA DataRequest configuration example.
