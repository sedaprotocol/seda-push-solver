# PLAN.md

# EVM Data Pusher Implementation Plan

## Executive Summary

This document outlines the comprehensive implementation plan for extending the SEDA DataRequest Pusher to automatically push completed DataRequest results to multiple EVM chains via the SEDA batch mechanism. The solution will integrate seamlessly with the existing architecture while adding robust multi-chain batch pushing capabilities.

### Key Objectives
- **Automatic Batch Detection**: Monitor SEDA chain for batches containing completed DataRequest results
- **Multi-Chain Parallel Pushing**: Push batches to multiple EVM L2 chains simultaneously
- **Transaction Success Tracking**: Monitor and report push transaction status across all chains  
- **Robust Error Handling**: Chain-specific retry policies with comprehensive failure recovery
- **Configuration Management**: File-based configuration with secure credential handling
- **Performance Monitoring**: Detailed metrics and health monitoring for operational visibility

## Current Architecture Analysis

### Existing Patterns and Strengths
The current codebase demonstrates excellent architectural patterns that will be leveraged:

1. **Service Container Pattern**: Clean dependency injection enables easy testing and modularity
2. **Modular Core Architecture**: Clear separation between `core/`, `services/`, `infrastructure/`, `helpers/`
3. **Configuration-Driven Design**: Environment-based configuration with file-based structure enables easy deployment management
4. **Task Completion Handlers**: Event-driven architecture for DataRequest lifecycle management
5. **Comprehensive Retry Logic**: Existing `executeWithRetry` with configurable attempts and delays
6. **Statistics & Monitoring**: Detailed tracking via `SchedulerStatistics` provides operational insights
7. **Sequence Coordination**: Sophisticated transaction sequencing prevents conflicts
8. **Structured Logging**: Visual, formatted logging with clear status indicators

### Current DataRequest Flow
The existing system follows a clean two-phase approach:
- **Phase 1**: DataRequest posting to SEDA chain returns `drId`, `blockHeight`, `txHash`  
- **Phase 2**: Background oracle result monitoring until completion with structured result data

This architecture provides the perfect foundation for adding a **Phase 3**: EVM batch pushing upon oracle completion.

## Implementation Architecture

### High-Level Architecture Overview

The EVM pusher will operate as a separate service that:
1. **Listens** for DataRequest completion events from the existing scheduler
2. **Tracks** which DataRequests belong to which SEDA batches  
3. **Monitors** SEDA chain for new batches containing completed DataRequests
4. **Checks** each target EVM chain to determine if batches are already pushed
5. **Pushes** missing batches to all configured EVM chains in parallel
6. **Tracks** transaction success/failure with comprehensive retry logic
7. **Reports** detailed statistics and health metrics

### Core Components Architecture

#### 1. EVM Pusher Service (Main Orchestrator)
- **Purpose**: Central coordination service that manages the entire EVM pushing pipeline
- **Responsibilities**: 
  - Coordinate between batch tracking, chain management, and statistics
  - Handle service lifecycle (startup, shutdown, health monitoring)
  - Implement background processing loop for pending batch detection
  - Integrate with existing infrastructure services (logging, timer, health)
- **Integration Point**: Extends the existing service container pattern

#### 2. Batch Tracker (SEDA Chain Integration)
- **Purpose**: Interface between SEDA chain and EVM pusher for batch management
- **Responsibilities**:
  - Query SEDA chain for batch information and DataRequest associations
  - Maintain mapping of completed DataRequests to their containing batches
  - Track which batches have been successfully pushed to which chains
  - Provide efficient batch status queries to avoid redundant pushes
- **Key Functions**: Batch querying, DR-to-batch mapping, push status tracking

#### 3. Chain Manager (Multi-Chain Coordination)  
- **Purpose**: Orchestrate parallel pushing across multiple EVM chains
- **Responsibilities**:
  - Manage individual chain executors for each configured EVM chain
  - Coordinate parallel batch pushing with proper error isolation
  - Aggregate results across chains and handle partial failures
  - Maintain chain-specific statistics and health monitoring
- **Design Pattern**: Fan-out execution with result aggregation

#### 4. EVM Chain Executors (Individual Chain Logic)
- **Purpose**: Handle all interactions with a specific EVM chain
- **Responsibilities**:
  - Check if batches are already pushed to avoid duplicates
  - Execute batch push transactions with proper gas management
  - Handle chain-specific retry logic and error recovery
  - Monitor transaction confirmations and finality
- **Key Features**: Chain-specific configuration, gas optimization, confirmation tracking

#### 5. Contract Interface Layer (EVM Contract Abstraction)
- **Purpose**: Abstract EVM contract interactions for SEDA Core and Prover contracts
- **Responsibilities**:
  - Provide typed interfaces for SEDA contract methods
  - Handle contract ABI management and function encoding
  - Manage transaction construction and signing
  - Abstract differences between EVM chains (gas models, confirmation times)

#### 6. Services Layer Extensions (Following Existing Patterns)
- **Batch Service**: SEDA chain querying and batch management operations
- **EVM Service**: EVM chain interactions, transaction management, and contract calls
- **Configuration Service**: EVM chain configuration loading and validation  
- **Statistics Service**: EVM pusher metrics tracking and reporting

## Detailed Implementation Phases

### Phase 1: Foundation Infrastructure (Weeks 1-2)

#### Directory Structure Design
The new components will follow the existing modular structure:
- `src/core/evm-pusher/` - Core EVM pushing logic and coordination
- `src/core/network/evm-config.ts` - EVM chain configuration management
- `src/services/batch-service.ts` - SEDA batch querying service
- `src/services/evm-service.ts` - EVM chain interaction service  
- `src/types/evm-types.ts` - EVM-specific type definitions
- `config/evm-chains.json` - Chain-specific configuration file

#### Configuration System Design
Following the existing pattern in `network-config.ts`, create comprehensive EVM chain configurations:

**Chain Configuration Structure**:
- **Network Details**: Chain ID, RPC endpoints, explorer URLs
- **Contract Addresses**: SEDA Core and Prover contract addresses per chain
- **Transaction Parameters**: Gas settings, confirmation requirements
- **Pusher Settings**: Batch check intervals, parallel execution limits
- **Retry Policies**: Chain-specific retry attempts, delays, and backoff strategies

**Configuration Management**:
- Environment variable integration for sensitive data (private keys, API keys)
- File-based configuration for chain-specific parameters
- Hot-reloading capability for operational configuration changes
- Validation and error handling for missing or invalid configurations

#### Service Layer Foundation
Extend the existing service container pattern with new service interfaces:

**IBatchService Interface**:
- Query batches by height range or specific batch
- Get DataRequest to batch associations
- Validate batch integrity and signatures
- Cache batch data for performance optimization

**IEVMService Interface**:
- Check batch push status on target chains
- Execute batch push transactions with proper gas management
- Query transaction status and confirmation counts
- Estimate gas costs for batch operations

### Phase 2: SEDA Chain Integration (Weeks 3-4)

#### Batch Tracking System
Design a sophisticated system to track the relationship between DataRequests and SEDA batches:

**DataRequest Completion Tracking**:
- Integration with existing `TaskCompletionHandler` to receive DR completion events
- Query SEDA chain to determine which batch contains each completed DataRequest
- Maintain local state mapping of DRs to batches for efficient lookup
- Handle edge cases where DRs may not immediately appear in batches

**Batch Status Management**:
- Track which batches have been successfully pushed to which chains
- Maintain persistent state to survive service restarts
- Implement batch prioritization based on age and importance
- Handle batch validation and integrity checking

**SEDA Chain Query Integration**:
- Utilize existing `@seda-protocol/dev-tools` batch query functions
- Implement efficient batch polling with proper error handling
- Cache batch data to minimize redundant chain queries
- Handle SEDA chain connectivity issues and retries

#### Push Status Verification
Implement robust checking mechanism to avoid duplicate pushes:

**Chain Status Queries**:
- Query each EVM chain's Prover contract for last pushed batch height
- Compare with available batches to identify missing pushes
- Handle chain connectivity issues and provide fallback mechanisms
- Implement caching to reduce redundant status checks

### Phase 3: Multi-Chain Push Engine (Weeks 5-6)

#### Parallel Execution Design
Build a sophisticated multi-chain coordination system:

**Chain Manager Architecture**:
- Maintain individual executors for each configured EVM chain
- Coordinate parallel batch pushing with proper resource management
- Handle partial failures gracefully without affecting other chains
- Implement circuit breaker patterns for problematic chains

**Error Isolation Strategy**:
- Ensure failures on one chain don't affect others
- Implement per-chain retry policies with exponential backoff
- Provide detailed error reporting and categorization
- Handle different types of failures (network, gas, contract, etc.)

#### Transaction Management
Implement robust transaction handling following existing retry patterns:

**Gas Management**:
- Implement dynamic gas price optimization based on network conditions
- Handle different gas models (legacy vs EIP-1559) per chain
- Provide gas cost monitoring and alerting for operational oversight
- Implement gas price capping to prevent excessive costs

**Confirmation Tracking**:
- Wait for appropriate confirmation counts per chain
- Handle chain reorganizations and transaction replacement
- Implement timeout handling for stuck transactions
- Provide transaction status monitoring and reporting

**Retry Logic Enhancement**:
- Extend existing `executeWithRetry` pattern for EVM-specific errors
- Implement chain-specific retry strategies and delays
- Handle different error types with appropriate retry behaviors
- Provide comprehensive retry statistics and monitoring

### Phase 4: Integration with Existing System (Weeks 7-8)

#### Scheduler Integration
Seamlessly integrate with the existing DataRequest scheduler:

**Event Integration**:
- Extend `SchedulerTaskCompletionHandler` to notify EVM pusher of DR completions
- Implement event queuing to handle high-volume completion notifications
- Provide backpressure handling if EVM pushing falls behind
- Maintain loose coupling between scheduler and EVM pusher

**Service Container Extension**:
- Add EVM pusher services to existing service container
- Implement proper dependency injection for all new services
- Ensure testability through interface-based design
- Maintain existing service lifecycle patterns

#### Background Service Architecture
Design EVM pusher as a background service similar to the existing scheduler:

**Service Lifecycle**:
- Implement standard start/stop/health check patterns
- Handle graceful shutdown with pending operation completion
- Provide service status monitoring and health reporting
- Integrate with existing infrastructure services

**Processing Loop Design**:
- Implement efficient batch detection loop with configurable intervals
- Handle processing queue management and prioritization
- Provide processing statistics and performance monitoring
- Implement circuit breakers for system protection

### Phase 5: Configuration and Environment Management (Weeks 9-10)

#### Environment Variable Strategy
Following existing patterns, implement secure configuration management:

**Sensitive Data Handling**:
- Store private keys and API keys in environment variables only
- Implement proper key rotation and security practices
- Provide clear documentation for required environment setup
- Handle missing or invalid credentials gracefully

**Configuration Validation**:
- Implement comprehensive configuration validation at startup
- Provide clear error messages for configuration issues
- Support configuration testing and validation tools
- Handle configuration updates without service restart where possible

#### File-Based Configuration
Extend existing configuration patterns for EVM-specific settings:

**Chain Configuration Files**:
- Support multiple environment configurations (dev, staging, prod)
- Implement configuration inheritance and overrides
- Provide configuration templates and examples
- Support dynamic chain addition/removal

### Phase 6: Monitoring and Observability (Weeks 11-12)

#### Statistics and Metrics System
Following the existing `SchedulerStatistics` pattern:

**EVM Pusher Statistics**:
- Track batch push success/failure rates per chain
- Monitor gas usage trends and cost optimization opportunities
- Track processing times and performance metrics
- Implement alerting thresholds for operational issues

**Per-Chain Metrics**:
- Chain-specific success rates and error categorization
- Transaction confirmation times and network health
- Gas price trends and cost analysis
- Push queue depths and processing backlogs

#### Health Monitoring Integration
Extend existing health monitoring for EVM pusher components:

**Chain Health Monitoring**:
- Monitor RPC endpoint availability and response times
- Track contract interaction success rates
- Implement automated chain failover where possible
- Provide health status dashboards and alerting

**Service Health Integration**:
- Integrate with existing `HealthService` infrastructure
- Provide detailed component health status
- Implement health check endpoints for operational monitoring
- Handle cascading health dependencies properly

#### Operational Dashboards
Design monitoring interfaces for operational visibility:

**Real-time Monitoring**:
- Live batch push status across all chains
- Processing queue status and backlog monitoring
- Error rate trends and performance metrics
- Gas usage optimization recommendations

**Historical Analysis**:
- Batch push success trends over time
- Cost analysis and optimization opportunities
- Performance benchmarking and capacity planning
- Error pattern analysis for system improvement

## Technical Integration Points

### DataRequest Lifecycle Integration
The EVM pusher integrates at the oracle completion phase:

1. **Existing Flow**: DR Posting → Oracle Awaiting → Completion Handler
2. **Enhanced Flow**: DR Posting → Oracle Awaiting → Completion Handler → **EVM Batch Tracking** → **Multi-Chain Push**

### Service Container Extensions
New services will integrate with existing dependency injection:
- `BatchService` for SEDA chain integration
- `EVMService` for EVM chain interactions  
- `EVMPusherService` for main coordination
- `EVMStatisticsService` for metrics tracking

### Configuration Integration
EVM configuration will follow existing patterns:
- Environment variables for sensitive data
- JSON configuration files for operational parameters
- Hot-reloading capability for runtime updates
- Validation and error handling consistency

## Error Handling and Recovery Strategy

### Error Categories and Handling
**Network Errors**: Connectivity issues, timeouts, RPC failures
- Implement exponential backoff with jitter
- Provide automatic retry with circuit breaker protection
- Handle graceful degradation and fallback mechanisms

**Contract Errors**: Gas estimation failures, transaction reverts, contract unavailability
- Implement contract-specific error handling and recovery
- Provide detailed error categorization and reporting
- Handle contract upgrade scenarios and version compatibility

**Chain-Specific Errors**: Nonce conflicts, gas price fluctuations, confirmation delays
- Implement chain-aware error handling strategies
- Provide chain-specific retry policies and delays
- Handle network congestion and dynamic adjustment

### Recovery Mechanisms
**Automatic Recovery**: Self-healing for transient issues
**Manual Recovery**: Administrative tools for complex issues
**Fallback Strategies**: Alternative approaches when primary methods fail
**State Recovery**: Rebuild from chain state after service interruption

## Security Considerations

### Private Key Management
- Environment variable storage only
- No private key logging or persistence
- Proper key rotation procedures
- Multi-signature support where applicable

### Transaction Security
- Nonce management and conflict prevention
- Gas limit validation and cost controls
- Transaction replay protection
- Confirmation requirement enforcement

### Network Security
- RPC endpoint validation and authentication
- Rate limiting and request throttling
- SSL/TLS enforcement for all connections
- Error message sanitization to prevent information leakage

## Performance Optimization

### Batch Processing Efficiency
- Parallel processing across multiple chains
- Efficient batch detection and queuing
- Resource usage optimization and monitoring
- Processing prioritization and backpressure handling

### Network Optimization
- Connection pooling and reuse
- Request batching where possible
- Caching strategies for frequently accessed data
- Load balancing across multiple RPC endpoints

### Memory and Resource Management
- Efficient data structures for tracking state
- Proper cleanup of completed operations
- Memory usage monitoring and optimization
- CPU usage balancing for parallel operations

## Testing Strategy

### Unit Testing Approach
**Service Layer Testing**: Mock external dependencies, test business logic isolation
**Configuration Testing**: Validate configuration parsing and validation logic
**Error Handling Testing**: Comprehensive error scenario coverage
**Statistics Testing**: Verify metrics accuracy and reporting

### Integration Testing Strategy
**SEDA Chain Integration**: Test batch querying and DR association logic
**EVM Chain Integration**: Test contract interactions and transaction handling
**Multi-Chain Coordination**: Test parallel execution and error isolation
**End-to-End Flow**: Complete DataRequest to EVM push verification

### Performance Testing
**Load Testing**: High-volume batch processing scenarios
**Stress Testing**: Resource exhaustion and recovery testing
**Latency Testing**: Processing time optimization verification
**Scalability Testing**: Multi-chain performance characteristics

### Security Testing
**Configuration Security**: Validate secure credential handling
**Transaction Security**: Test transaction construction and signing
**Error Handling Security**: Ensure no sensitive data leakage
**Network Security**: Validate secure communications

## Deployment and Operations

### Deployment Strategy
**Configuration Management**: Environment-specific configuration handling
**Service Deployment**: Integration with existing deployment processes
**Database/State Management**: Persistent state handling and migration
**Monitoring Integration**: Observability and alerting setup

### Operational Procedures
**Service Monitoring**: Health check and performance monitoring setup
**Error Response**: Incident response procedures and escalation
**Configuration Updates**: Safe configuration change procedures
**Maintenance Procedures**: Planned maintenance and upgrade procedures

### Scaling Considerations
**Horizontal Scaling**: Multi-instance deployment strategies
**Vertical Scaling**: Resource allocation and optimization
**Chain Addition**: Procedures for adding new EVM chains
**Load Distribution**: Request distribution and balancing

## Implementation Timeline

### Weeks 1-2: Foundation Infrastructure
- **Deliverables**: Directory structure, configuration system, service interfaces
- **Key Activities**: Architecture setup, configuration design, service container extensions
- **Success Criteria**: Clean service integration, comprehensive configuration validation

### Weeks 3-4: SEDA Chain Integration  
- **Deliverables**: Batch tracking system, DR completion integration
- **Key Activities**: SEDA chain querying, batch-DR mapping, completion event handling
- **Success Criteria**: Accurate batch detection, reliable DR-batch association

### Weeks 5-6: Multi-Chain Push Engine
- **Deliverables**: Chain manager, EVM executors, parallel coordination
- **Key Activities**: Multi-chain architecture, transaction management, error isolation
- **Success Criteria**: Successful parallel pushing, robust error handling

### Weeks 7-8: System Integration
- **Deliverables**: Scheduler integration, background service implementation
- **Key Activities**: Event integration, service lifecycle, processing loops
- **Success Criteria**: Seamless integration, stable background operation

### Weeks 9-10: Configuration and Security
- **Deliverables**: Environment management, security implementation, configuration validation
- **Key Activities**: Secure credential handling, configuration testing, deployment preparation
- **Success Criteria**: Production-ready configuration, security validation

### Weeks 11-12: Monitoring and Operations
- **Deliverables**: Statistics system, health monitoring, operational dashboards
- **Key Activities**: Metrics implementation, monitoring integration, documentation
- **Success Criteria**: Comprehensive observability, operational readiness

## Dependencies and Prerequisites

### External Dependencies
**EVM Libraries**: `ethers` or `viem` for EVM chain interactions
**SEDA Tools**: Updated `@seda-protocol/dev-tools` with batch query capabilities
**Configuration**: Chain-specific RPC endpoints and contract addresses
**Credentials**: Private keys for transaction signing on each chain

### Infrastructure Requirements
**Network Access**: Reliable connectivity to all target EVM chains
**Resource Allocation**: Sufficient compute and memory for parallel processing
**Storage**: Persistent storage for batch tracking and statistics
**Monitoring**: Integration with existing monitoring and alerting systems

### Development Prerequisites
**Contract Information**: SEDA Core and Prover contract ABIs and addresses
**Chain Configuration**: Detailed configuration for each target EVM chain
**Testing Infrastructure**: Access to testnets for comprehensive testing
**Documentation**: Updated documentation for new functionality

## Risk Mitigation

### Technical Risks
**SEDA Chain Dependency**: Mitigate with robust error handling and fallback mechanisms
**EVM Chain Reliability**: Implement circuit breakers and alternative RPC endpoints
**Transaction Failures**: Comprehensive retry logic and manual recovery procedures
**Performance Issues**: Load testing and resource optimization strategies

### Operational Risks
**Configuration Errors**: Comprehensive validation and testing procedures
**Security Vulnerabilities**: Security review and penetration testing
**Deployment Issues**: Staged deployment with rollback capabilities
**Monitoring Gaps**: Comprehensive observability and alerting coverage

### Business Risks
**Cost Management**: Gas cost monitoring and optimization strategies
**Service Reliability**: High availability architecture and redundancy
**Scalability Limits**: Performance testing and capacity planning
**Integration Complexity**: Modular design and comprehensive testing

## Success Criteria

### Functional Requirements
- ✅ Automatic detection of completed DataRequests and their associated batches
- ✅ Parallel pushing of batches to multiple EVM chains with success tracking
- ✅ Robust error handling with chain-specific retry policies
- ✅ Comprehensive configuration management with secure credential handling
- ✅ Integration with existing scheduler without disruption

### Performance Requirements
- ✅ Process batch pushes within 60 seconds of batch availability
- ✅ Support concurrent pushing to 5+ EVM chains
- ✅ Maintain >99% success rate for batch pushes under normal conditions
- ✅ Handle 100+ DataRequest completions per hour efficiently
- ✅ Resource usage compatible with existing system requirements

### Operational Requirements
- ✅ Comprehensive monitoring and alerting for all components
- ✅ Clear documentation and operational procedures
- ✅ Production-ready deployment with proper security measures
- ✅ Backward compatibility with existing functionality
- ✅ Maintainable codebase following established patterns

This implementation plan provides a comprehensive roadmap for adding robust EVM batch pushing capabilities to the SEDA DataRequest Pusher while maintaining the high architectural standards and operational excellence of the existing system.