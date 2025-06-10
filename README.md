# DXFeed Pusher - SEDA DataRequest Configuration

A TypeScript project for configuring and posting DataRequests to the SEDA network for DXFeed financial data.

## ✅ **Status: Tested & Working**

This configuration has been successfully tested against the SEDA testnet. DataRequests are posted correctly and processed by the network.

## Quick Start

```bash
# Install dependencies
bun install

# Run the demo
bun run demo

# Test configuration
bun test

# Test DataRequest posting (requires .env setup)
bun run test:datarequest
```

## Project Structure

```
dxfeed-pusher/
├── src/                    # Source code
│   ├── index.ts           # Main entry point
│   └── seda-config.ts     # SEDA configuration and builder
├── tests/                 # Test files
│   ├── test-seda-config.ts      # Configuration tests
│   ├── test-datarequest.ts      # DataRequest posting tests
│   └── test-multiple-requests.ts # Multiple request tests
├── examples/              # Example usage
│   └── demo.ts           # Demo application
├── config/               # Configuration templates
│   └── env.example       # Environment template
├── docs/                 # Documentation
│   └── README.md         # Detailed documentation
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
└── .env                  # Environment variables (create from template)
```

## Environment Setup

```bash
# Copy environment template
cp config/env.example .env

# Edit with your configuration
SEDA_RPC_ENDPOINT=https://rpc.testnet.seda.xyz
SEDA_MNEMONIC="your 24-word mnemonic phrase here"
ORACLE_PROGRAM_ID="your-deployed-oracle-program-id"
```

## Available Scripts

- `bun start` / `bun run demo` - Run the demo application
- `bun test` - Run configuration tests
- `bun run test:datarequest` - Test DataRequest posting
- `bun run test:multiple` - Test multiple DataRequests
- `bun run test:all` - Run all tests
- `bun run build` - Type check the project
- `bun run lint` - Lint the project

## Documentation

See [detailed documentation](docs/README.md) for:
- Complete API reference
- Configuration options
- Usage examples
- Testing results
- SEDA network integration guide

## Features

- ✅ SEDA TypeScript SDK integration
- ✅ Multiple data types (price, quote, trade, candle, greeks, profile)
- ✅ Network configuration (testnet, mainnet, local)
- ✅ Comprehensive testing suite
- ✅ Detailed logging and error handling
- ✅ Production-ready configuration

## Requirements

- Node.js v18 or higher
- Bun runtime
- SEDA Account with testnet tokens
- Oracle Program deployed to SEDA network

## License

This project was created using `bun init` in bun v1.2.9. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime. 