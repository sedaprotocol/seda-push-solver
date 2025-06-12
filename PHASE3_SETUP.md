# Phase 3: Multi-Chain Push Engine Setup Guide

## Overview

Phase 3 implements the Multi-Chain Push Engine that automatically pushes completed SEDA batches to multiple EVM chains in parallel. This guide covers the setup and configuration required.

## Environment Variables Required

### SEDA Contract Addresses

For each enabled EVM chain, you need to set the SEDA contract addresses:

```bash
# Arbitrum One (Chain ID: 42161)
export ARBITRUM_SEDA_CORE_ADDRESS="0x..."
export ARBITRUM_SEDA_PROVER_ADDRESS="0x..."

# Optimism (Chain ID: 10)
export OPTIMISM_SEDA_CORE_ADDRESS="0x..."
export OPTIMISM_SEDA_PROVER_ADDRESS="0x..."

# Base (Chain ID: 8453)
export BASE_SEDA_CORE_ADDRESS="0x..."
export BASE_SEDA_PROVER_ADDRESS="0x..."

# Polygon (Chain ID: 137)
export POLYGON_SEDA_CORE_ADDRESS="0x..."
export POLYGON_SEDA_PROVER_ADDRESS="0x..."
```

### EVM Pusher Configuration

```bash
# Enabled chains (comma-separated chain IDs)
export EVM_ENABLED_CHAINS="42161,10"  # Default: Arbitrum + Optimism

# Batch polling configuration
export EVM_BATCH_POLLING_INTERVAL_MS="10000"  # 10 seconds
export EVM_BATCH_WINDOW="10"                  # Check last 10 batches
export EVM_MAX_BATCH_AGE_MS="3600000"         # 1 hour max age

# Concurrency limits
export EVM_MAX_PARALLEL_CHAINS="5"            # Max chains to push to simultaneously
export EVM_MAX_TX_PER_CHAIN="3"               # Max concurrent transactions per chain

# Monitoring and alerting
export EVM_ENABLE_METRICS="true"
export EVM_HEALTH_CHECK_INTERVAL_MS="30000"   # 30 seconds
export EVM_MIN_SUCCESS_RATE="90"              # Alert if success rate < 90%
export EVM_MAX_AVG_PUSH_TIME_MS="120000"      # Alert if avg push time > 2 minutes
export EVM_MAX_CONSECUTIVE_FAILURES="5"       # Alert after 5 consecutive failures
```

### Private Keys for Transaction Signing

```bash
# Private key for signing transactions (required for each chain)
export EVM_PRIVATE_KEY="0x..."

# Alternative: Use different keys per chain
export ARBITRUM_PRIVATE_KEY="0x..."
export OPTIMISM_PRIVATE_KEY="0x..."
export BASE_PRIVATE_KEY="0x..."
export POLYGON_PRIVATE_KEY="0x..."
```

## Supported Chains

| Chain | Chain ID | Name | Default RPC |
|-------|----------|------|-------------|
| Arbitrum One | 42161 | Arbitrum One | https://arb1.arbitrum.io/rpc |
| Optimism | 10 | Optimism | https://mainnet.optimism.io |
| Base | 8453 | Base | https://mainnet.base.org |
| Polygon | 137 | Polygon | https://polygon-rpc.com |

## Phase 3 Architecture

### Core Components

1. **EVM Pusher Service** (`src/core/evm-pusher/evm-pusher-service.ts`)
   - Main orchestrator for multi-chain batch pushing
   - Integrates with Phase 2 DataRequest tracker and batch service
   - Background processing with configurable intervals
   - Comprehensive error handling and retry logic

2. **Chain Manager** (`src/core/evm-pusher/chain-manager.ts`)
   - Coordinates parallel pushing across multiple chains
   - Manages individual chain executors
   - Aggregates results and handles partial failures
   - Chain health monitoring

3. **EVM Chain Executor** (`src/core/evm-pusher/evm-chain-executor.ts`)
   - Handles interactions with individual EVM chains
   - Transaction management with gas optimization
   - Chain-specific retry logic and error handling
   - Confirmation tracking

4. **Contract Interface** (`src/core/evm-pusher/contract-interface.ts`)
   - Abstracts EVM contract interactions
   - SEDA Core and Prover contract integration
   - Transaction construction and signing
   - Gas estimation and price optimization

### Integration with Phase 2

Phase 3 integrates seamlessly with Phase 2 services:

- **DataRequest Tracker**: Listens for batch assignment events
- **Batch Service**: Queries batch information and validates data
- **SEDA Chain Service**: Monitors SEDA chain health and status

### Data Flow

1. **DataRequest Completion** (Phase 2) → **Batch Assignment Detection** (Phase 2)
2. **Batch Discovery** (Phase 3) → **Multi-Chain Push Coordination** (Phase 3)
3. **Parallel Execution** (Phase 3) → **Result Aggregation** (Phase 3)
4. **Statistics & Monitoring** (Phase 3)

## Testing Phase 3

### Run Phase 3 Tests

```bash
# Run Phase 3 multi-chain push engine tests
npm test tests/unit/multi-chain-push-engine.test.ts

# Run all tests including Phase 2 and Phase 3
npm test
```

### Test Results Expected

```
📋 Test 1: Contract Interface ✅
📋 Test 2: EVM Chain Executor ✅  
📋 Test 3: Chain Manager ⚠️ (requires environment variables)
📋 Test 4: EVM Pusher Service ✅
📋 Test 5: Multi-Chain Integration ✅
```

### Mock vs Production Testing

- **Mock Services**: Work without environment variables for unit testing
- **Production Services**: Require proper environment configuration
- **Integration Tests**: Use mock services to test complete workflows

## Configuration Examples

### Development Environment

```bash
# Minimal setup for development (uses mocks)
export EVM_ENABLED_CHAINS="42161,10"
export EVM_BATCH_POLLING_INTERVAL_MS="5000"
export EVM_MAX_PARALLEL_CHAINS="2"
```

### Production Environment

```bash
# Full production configuration
export EVM_ENABLED_CHAINS="42161,10,8453,137"
export ARBITRUM_SEDA_CORE_ADDRESS="0x1234..."
export ARBITRUM_SEDA_PROVER_ADDRESS="0x5678..."
export OPTIMISM_SEDA_CORE_ADDRESS="0x9abc..."
export OPTIMISM_SEDA_PROVER_ADDRESS="0xdef0..."
export BASE_SEDA_CORE_ADDRESS="0x1111..."
export BASE_SEDA_PROVER_ADDRESS="0x2222..."
export POLYGON_SEDA_CORE_ADDRESS="0x3333..."
export POLYGON_SEDA_PROVER_ADDRESS="0x4444..."
export EVM_PRIVATE_KEY="0xabcdef..."
export EVM_BATCH_POLLING_INTERVAL_MS="10000"
export EVM_MAX_PARALLEL_CHAINS="4"
export EVM_ENABLE_METRICS="true"
```

## Monitoring and Observability

### Statistics Available

- **Batch Processing**: Total processed, success/failure rates
- **Chain Performance**: Per-chain success rates, gas usage, timing
- **Queue Management**: Pending batches, processing backlogs
- **Error Tracking**: Error categorization and retry statistics

### Health Monitoring

- **Chain Health**: RPC endpoint availability, contract interaction success
- **Service Health**: Processing loop status, queue depths
- **Performance Metrics**: Push times, gas costs, confirmation delays

### Event System

Phase 3 emits events for monitoring:

- `batch-discovered`: New batch ready for pushing
- `batch-push-started`: Push initiated for a chain
- `batch-push-success`: Successful push completion
- `batch-push-failed`: Push failure with error details
- `batch-completed`: All chains completed for a batch
- `chain-health-changed`: Chain health status updates

## Security Considerations

### Private Key Management

- Store private keys in environment variables only
- Never log or persist private keys
- Use different keys per chain for isolation
- Implement proper key rotation procedures

### Transaction Security

- Nonce management to prevent conflicts
- Gas limit validation and cost controls
- Transaction replay protection
- Confirmation requirements enforcement

### Network Security

- RPC endpoint validation and authentication
- Rate limiting and request throttling
- SSL/TLS enforcement for all connections
- Error message sanitization

## Performance Optimization

### Batch Processing

- Parallel processing across multiple chains
- Efficient batch detection and queuing
- Resource usage optimization
- Processing prioritization and backpressure handling

### Network Optimization

- Connection pooling and reuse
- Request batching where possible
- Caching strategies for frequently accessed data
- Load balancing across multiple RPC endpoints

---

**Status**: Phase 3 Multi-Chain Push Engine implementation complete and ready for production deployment with proper environment configuration. 