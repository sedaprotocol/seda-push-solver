/**
 * DataRequest Executor
 * Handles the execution and result processing of DataRequests on the SEDA network
 */

import { postDataRequest, awaitDataResult, Signer } from '@seda-protocol/dev-tools';
import type { PostDataRequestInput, GasOptions, QueryConfig } from '@seda-protocol/dev-tools';
import type { DataRequestResult, NetworkConfig } from '../../types';
import type { ILoggingService } from '../../services';
import { hexBEToNumber } from '../../helpers/hex-converter';

// Import SEDA chain services for real batch handling
import { QueryClient, createProtobufRpcClient } from "@cosmjs/stargate";
import { Comet38Client } from "@cosmjs/tendermint-rpc";
import { sedachain } from "@seda-protocol/proto-messages";

// Import EVM network support for batch checking and posting
import { getEnabledEvmNetworks, evmPrivateKey } from '../../../config';
import type { EvmNetworkConfig } from '../../../config';
import { iProver } from '../../../evm-abi/src/i-prover.abi';
import { iSedaCore } from '../../../evm-abi/src/i-seda-core.abi';
import { abiSecp256k1ProverV1 } from '../../../evm-abi/src/abi-secp256k1-prover-v1.abi';
import { 
  http, 
  createPublicClient,
  createWalletClient,
  type PublicClient,
  type WalletClient,
  fallback
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';
import { encodePacked, keccak256, toHex, padBytes } from 'viem';
import { ExtendedSecp256k1Signature, Secp256k1 } from '@cosmjs/crypto';
import { Unit } from 'true-myth';

// Cache for discovered prover contract addresses
const proverAddressCache = new Map<string, string>();

// EVM Batch structure for posting
interface EvmBatch {
  batchHeight: bigint;
  blockHeight: bigint;
  validatorsRoot: `0x${string}`;
  resultsRoot: `0x${string}`;
  provingMetadata: `0x${string}`;
}

// Add signature processing constants and utilities
const CONSENSUS_PERCENTAGE = 66_666_666; // 66.666666%, represented as parts per 100,000,000
const SECP256K1_DOMAIN_SEPARATOR = "0x01";

function recoverSecp256k1PublicKey(signature: Uint8Array, message: Buffer): Buffer {
  const extended = ExtendedSecp256k1Signature.fromFixedLength(signature);
  return Buffer.from(Secp256k1.recoverPubkey(extended, message));
}

function createEthAddress(publicKey: Buffer): Buffer {
  const pubKeyNoPrefix = publicKey.length === 65 ? publicKey.subarray(1) : publicKey;
  const ethAddressHash = keccak256(pubKeyNoPrefix);
  return Buffer.from(ethAddressHash.slice(-20));
}

function strip0x(hex: string): string {
  if (typeof hex !== 'string') {
    console.error('❌ strip0x called with non-string:', hex, 'type:', typeof hex);
    console.error('❌ Stack trace:', new Error().stack);
    throw new Error(`strip0x expects string, got ${typeof hex}: ${JSON.stringify(hex)}`);
  }
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

function add0x(hex: string): `0x${string}` {
  const hexString = typeof hex === 'string' ? hex : String(hex);
  return hexString.startsWith('0x') ? hexString as `0x${string}` : `0x${hexString}`;
}

/**
 * Post a DataRequest transaction to the SEDA network (just posting, no waiting)
 * This is the phase that should be coordinated by sequence to prevent conflicts
 */
export async function postDataRequestTransaction(
  signer: Signer, 
  postInput: PostDataRequestInput, 
  gasOptions: GasOptions, 
  networkConfig: NetworkConfig,
  logger: ILoggingService
): Promise<{ drId: string; blockHeight: bigint; txHash: string }> {
  
  // Clean, structured configuration display
  logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
  logger.info('│                        📤 Posting DataRequest                       │');
  logger.info('├─────────────────────────────────────────────────────────────────────┤');
  logger.info(`│ Oracle Program ID: ${postInput.execProgramId}`);
  logger.info(`│ Replication Factor: ${postInput.replicationFactor || 0}`);
  logger.info(`│ Gas Limit: ${postInput.execGasLimit?.toLocaleString() || 'N/A'}`);
  logger.info(`│ Gas Price: ${(postInput.gasPrice || 0).toString()}`);
  logger.info('└─────────────────────────────────────────────────────────────────────┘');
  
  logger.info('\n🚀 Posting DataRequest transaction to SEDA network...');
  
  // Post the DataRequest transaction (this waits for inclusion in block)
  const postResult = await postDataRequest(signer, postInput, gasOptions);
  
  // Log successful posting
  logger.info(`✅ DataRequest posted successfully!`);
  logger.info(`   📋 Request ID: ${postResult.dr.id}`);
  logger.info(`   📦 Block Height: ${postResult.dr.height}`);
  logger.info(`   🔗 Transaction: ${postResult.tx}`);
  
  return {
    drId: postResult.dr.id,
    blockHeight: postResult.dr.height,
    txHash: postResult.tx
  };
}

/**
 * Wait for a DataRequest to be executed and return results
 * This phase happens in parallel and doesn't need sequence coordination
 */
export async function awaitDataRequestResult(
  queryConfig: QueryConfig,
  drId: string,
  blockHeight: bigint,
  awaitOptions: { timeoutSeconds: number; pollingIntervalSeconds: number, maxBatchRetries: number, batchPollingIntervalMs: number },
  networkConfig: NetworkConfig,
  logger: ILoggingService
): Promise<DataRequestResult> {
  
  logger.info(`\n⏳ Waiting for DataRequest ${drId} to complete...`);
  logger.info(`   📦 Block Height: ${blockHeight}`);
  logger.info(`   ⏱️ Timeout: ${awaitOptions.timeoutSeconds}s`);
  logger.info(`   🔄 Polling: every ${awaitOptions.pollingIntervalSeconds}s`);

  // Create DataRequest object for awaiting
  const dataRequest = { id: drId, height: blockHeight };
  
  // Wait for DataRequest execution to complete
  const result = await awaitDataResult(queryConfig, dataRequest, {
    timeoutSeconds: awaitOptions.timeoutSeconds,
    pollingIntervalSeconds: awaitOptions.pollingIntervalSeconds
  });
  
  // Clean, structured results display
  logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
  logger.info('│                         ✅ DataRequest Results                      │');
  logger.info('├─────────────────────────────────────────────────────────────────────┤');
  logger.info(`│ Request ID: ${result.drId}`);
  logger.info(`│ Exit Code: ${result.exitCode}`);
  logger.info(`│ Block Height: ${result.drBlockHeight}`);
  logger.info(`│ Gas Used: ${result.gasUsed}`);
  logger.info(`│ Consensus: ${result.consensus || 'N/A'}`);
  
  // Handle result data display
  if (result.result) {
    logger.info(`│ Result (hex): ${result.result}`);
    
    // Show numeric conversion if it looks like hex
    if (typeof result.result === 'string' && /^(0x)?[0-9a-fA-F]+$/.test(result.result)) {
      try {
        const numericResult = hexBEToNumber(result.result);
        logger.info(`│ Result (number): ${numericResult}`);
      } catch (error) {
        // Silent fail for conversion errors
      }
    }
  } else {
    logger.info(`│ Result: No result data`);
  }
  
  logger.info('├─────────────────────────────────────────────────────────────────────┤');
  if (networkConfig.explorerEndpoint) {
    logger.info(`│ Explorer: ${networkConfig.explorerEndpoint}/data-requests/${result.drId}/${result.drBlockHeight}`);
  } else {
    logger.info(`│ Explorer: N/A`);
  }
  logger.info('└─────────────────────────────────────────────────────────────────────┘');
  
  // NEW: Fetch batch assignment and batch information from actual SEDA chain
  logger.info('\n🔍 Fetching batch assignment and batch information from SEDA chain...');
  try {
    const batch = await fetchRealBatchFromSedaChain(drId, blockHeight, queryConfig, logger, awaitOptions.maxBatchRetries, awaitOptions.batchPollingIntervalMs);
    
    if (batch) {
      console.log('batch', batch);
      // Log the batch information
      logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
      logger.info('│                           📦 Real Batch Information                 │');
      logger.info('├─────────────────────────────────────────────────────────────────────┤');
      logger.info(`│ Batch Number: ${batch.batchNumber}`);
      logger.info(`│ Batch ID: ${batch.batchId}`);
      logger.info(`│ Block Height: ${batch.blockHeight}`);
      logger.info(`│ Current Data Result Root: ${batch.currentDataResultRoot}`);
      logger.info(`│ Data Result Root: ${batch.dataResultRoot}`);
      logger.info(`│ Validator Root: ${batch.validatorRoot}`);
      if (batch.dataResultEntries) {
        logger.info(`│ Data Result Entries: ${batch.dataResultEntries.length} entries`);
      }
      if (batch.batchSignatures) {
        logger.info(`│ Validator Signatures: ${batch.batchSignatures.length} signatures`);
      }
      if (batch.validatorEntries) {
        logger.info(`│ Validator Entries: ${batch.validatorEntries.length} validators`);
      }
      logger.info('└─────────────────────────────────────────────────────────────────────┘');
      
      // Check and post batch to all EVM networks in parallel
      const evmBatchResults = await checkAndPostBatchOnAllEvmNetworks(batch, logger);
      
      // Log detailed results for each network
      if (evmBatchResults.length > 0) {
        logger.info('\n📊 Detailed EVM Network Batch Status:');
        for (const result of evmBatchResults) {
          const status = result.batchExists ? '✅ EXISTS' : '❌ MISSING';
          const lastHeight = result.lastBatchHeight !== null ? result.lastBatchHeight.toString() : 'N/A';
          const postInfo = result.posted !== undefined ? (result.posted ? ' | 🚀 POSTED' : ' | ⚠️ POST FAILED') : '';
          const txInfo = result.txHash ? ` | TX: ${result.txHash}` : '';
          const errorInfo = result.error ? ` | Error: ${result.error}` : '';
          logger.info(`   ${result.networkName}: ${status} | Last Height: ${lastHeight}${postInfo}${txInfo}${errorInfo}`);
        }
      }
    }
  } catch (error) {
    logger.warn(`⚠️ Could not fetch batch information: ${error instanceof Error ? error.message : error}`);
  }
  
  return {
    drId: result.drId,
    exitCode: result.exitCode,
    result: result.result,
    blockHeight: Number(result.blockHeight),
    gasUsed: result.gasUsed.toString()
  };
}

/**
 * Create protobuf RPC client for SEDA chain queries
 */
async function createSedaQueryClient(rpc: string) {
  const cometClient = await Comet38Client.connect(rpc);
  const queryClient = new QueryClient(cometClient);
  return createProtobufRpcClient(queryClient);
}

/**
 * Simple batch info structure for our needs
 */
interface SimpleBatch {
  batchNumber: bigint;
  batchId: string;
  blockHeight: bigint;
  currentDataResultRoot: string;
  dataResultRoot: string;
  validatorRoot: string;
  dataResultEntries?: any[];
  batchSignatures?: any[];
  validatorEntries?: any[];
}

/**
 * Get DataResult to find batch assignment
 */
async function getDataResult(
  drId: string,
  blockHeight: bigint,
  queryConfig: QueryConfig,
  logger: ILoggingService
): Promise<{ batchAssignment: bigint } | null> {
  try {
    const protoClient = await createSedaQueryClient(queryConfig.rpc);
    const client = new sedachain.batching.v1.QueryClientImpl(protoClient);
    
    logger.info(`📋 Querying DataResult for ${drId} at height ${blockHeight}...`);
    
    const response = await client.DataResult({ 
      dataRequestId: drId, 
      dataRequestHeight: blockHeight 
    });
    
    if (!response.batchAssignment || !response.dataResult) {
      logger.warn(`⚠️ DataResult not found for ${drId}`);
      return null;
    }
    
    logger.info(`✅ DataResult found - assigned to batch ${response.batchAssignment.batchNumber}`);
    
    return {
      batchAssignment: response.batchAssignment.batchNumber
    };
    
  } catch (error) {
    logger.error(`❌ Failed to get DataResult: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * Get batch information directly from SEDA chain
 */
async function getBatch(
  batchNumber: bigint,
  queryConfig: QueryConfig,
  logger: ILoggingService
): Promise<SimpleBatch | null> {
  try {
    const protoClient = await createSedaQueryClient(queryConfig.rpc);
    const client = new sedachain.batching.v1.QueryClientImpl(protoClient);
    
    logger.info(`📦 Querying batch ${batchNumber} from SEDA chain...`);
    
    const response = await client.Batch({ 
      batchNumber, 
      latestSigned: false 
    });
    
    if (!response.batch) {
      logger.warn(`⚠️ Batch ${batchNumber} not found`);
      return null;
    }
    
    const { batch, batchSignatures, dataResultEntries, validatorEntries } = response;
    
    // Check if batch has signatures (indicates it's been signed by validators)
    if (!batchSignatures || batchSignatures.length === 0) {
      logger.warn(`⚠️ Batch ${batchNumber} has no signatures yet (still being processed by validators)`);
      return null;
    }
    
    if (!validatorEntries || validatorEntries.length === 0) {
      logger.warn(`⚠️ Batch ${batchNumber} has no validator entries`);
      return null;
    }
    
    logger.info(`✅ Batch ${batchNumber} fetched successfully with ${batchSignatures.length} signatures and ${validatorEntries.length} validators!`);
    
    return {
      batchNumber: batch.batchNumber,
      batchId: Buffer.from(batch.batchId).toString('hex'),
      blockHeight: batch.blockHeight,
      currentDataResultRoot: batch.currentDataResultRoot,
      dataResultRoot: batch.dataResultRoot,
      validatorRoot: batch.validatorRoot,
      dataResultEntries: dataResultEntries?.entries || [],
      batchSignatures: batchSignatures || [],
      validatorEntries: validatorEntries || []
    };
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      logger.warn(`⚠️ Batch ${batchNumber} not found on chain`);
      return null;
    }
    logger.error(`❌ Failed to get batch ${batchNumber}: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * Fetch real batch information from SEDA chain using existing QueryConfig connection
 */
async function fetchRealBatchFromSedaChain(
  drId: string,
  blockHeight: bigint,
  queryConfig: QueryConfig,
  logger: ILoggingService,
  maxRetries: number = 10,
  pollingIntervalMs: number = 3000
): Promise<SimpleBatch | null> {
  try {
    // Step 1: Get DataResult with batch assignment
    const dataResult = await getDataResult(drId, blockHeight, queryConfig, logger);
    
    if (!dataResult) {
      return null;
    }
    
    const { batchAssignment } = dataResult;
    
    // Step 2: Poll for batch completion and fetch batch details
    logger.info(`⏳ Polling for batch ${batchAssignment} completion...`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(`🔄 Batch polling attempt ${attempt}/${maxRetries} for batch ${batchAssignment}...`);
      
      const batch = await getBatch(batchAssignment, queryConfig, logger);
      
      if (batch) {
        logger.info(`✅ Batch ${batchAssignment} fetched successfully from SEDA chain!`);
        return batch;
      }
      
      if (attempt < maxRetries) {
        logger.info(`⏱️ Batch ${batchAssignment} not ready yet, waiting ${pollingIntervalMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, pollingIntervalMs));
      }
    }
    
    // If the assigned batch doesn't have signatures yet, try to get the latest signed batch
    logger.warn(`⚠️ Assigned batch ${batchAssignment} not ready after ${maxRetries} attempts`);
    logger.info(`🔄 Trying to fetch latest signed batch instead...`);
    
    try {
      const latestSignedBatch = await getLatestSignedBatch(queryConfig, logger);
      if (latestSignedBatch) {
        logger.info(`✅ Using latest signed batch ${latestSignedBatch.batchNumber} instead of assigned batch ${batchAssignment}`);
        return latestSignedBatch;
      }
    } catch (error) {
      logger.error(`❌ Failed to fetch latest signed batch: ${error instanceof Error ? error.message : error}`);
    }
    
    logger.error(`❌ Failed to fetch any usable batch for DataRequest ${drId}`);
    return null;

  } catch (error) {
    logger.error(`❌ Failed to fetch batch information: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * Get the latest signed batch from SEDA chain
 */
async function getLatestSignedBatch(
  queryConfig: QueryConfig,
  logger: ILoggingService
): Promise<SimpleBatch | null> {
  try {
    const protoClient = await createSedaQueryClient(queryConfig.rpc);
    const client = new sedachain.batching.v1.QueryClientImpl(protoClient);
    
    logger.info(`📦 Querying latest signed batch from SEDA chain...`);
    
    const response = await client.Batch({ 
      batchNumber: 0n, // Ignored when latestSigned is true
      latestSigned: true 
    });
    
    if (!response.batch) {
      logger.warn(`⚠️ No latest signed batch found`);
      return null;
    }
    
    const { batch, batchSignatures, dataResultEntries, validatorEntries } = response;
    
    // Check if batch has signatures
    if (!batchSignatures || batchSignatures.length === 0) {
      logger.warn(`⚠️ Latest signed batch has no signatures`);
      return null;
    }
    
    if (!validatorEntries || validatorEntries.length === 0) {
      logger.warn(`⚠️ Latest signed batch has no validator entries`);
      return null;
    }
    
    logger.info(`✅ Latest signed batch ${batch.batchNumber} fetched with ${batchSignatures.length} signatures!`);
    
    return {
      batchNumber: batch.batchNumber,
      batchId: Buffer.from(batch.batchId).toString('hex'),
      blockHeight: batch.blockHeight,
      currentDataResultRoot: batch.currentDataResultRoot,
      dataResultRoot: batch.dataResultRoot,
      validatorRoot: batch.validatorRoot,
      dataResultEntries: dataResultEntries?.entries || [],
      batchSignatures: batchSignatures || [],
      validatorEntries: validatorEntries || []
    };
    
  } catch (error) {
    logger.error(`❌ Failed to get latest signed batch: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * Execute a DataRequest on the SEDA network and await its completion
 * Legacy function that combines posting and awaiting for backward compatibility
 */
export async function executeDataRequest(
  signer: Signer, 
  postInput: PostDataRequestInput, 
  gasOptions: GasOptions, 
  awaitOptions: { timeoutSeconds: number; pollingIntervalSeconds: number, maxBatchRetries: number, batchPollingIntervalMs: number },
  networkConfig: NetworkConfig,
  logger: ILoggingService
): Promise<DataRequestResult> {
  
  // Post the transaction first
  const postResult = await postDataRequestTransaction(signer, postInput, gasOptions, networkConfig, logger);
  
  // Then wait for results
  const queryConfig: QueryConfig = { rpc: signer.getEndpoint() };
  return await awaitDataRequestResult(
    queryConfig,
    postResult.drId,
    postResult.blockHeight,
    awaitOptions,
    networkConfig,
    logger
  );
}

/**
 * Discover the prover contract address for a specific EVM network
 */
async function discoverProverAddress(
  network: EvmNetworkConfig,
  logger: ILoggingService
): Promise<string | null> {
  const cacheKey = `${network.name}-${network.contractAddress}`;
  
  // Check cache first
  const cached = proverAddressCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    logger.info(`🔍 Discovering prover contract address for ${network.displayName}...`);
    
    // Create public client for this network
    const transport = http(network.rpcUrl);
    const publicClient = createPublicClient({ transport });
    
    // Call getSedaProver on the SEDA Core contract
    const proverAddress = await publicClient.readContract({
      address: network.contractAddress as `0x${string}`,
      abi: iSedaCore,
      functionName: 'getSedaProver',
      args: []
    }) as string;
    
    // Cache the discovered address
    proverAddressCache.set(cacheKey, proverAddress);
    
    logger.info(`✅ ${network.displayName}: Discovered prover contract at ${proverAddress}`);
    
    return proverAddress;
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.warn(`⚠️ Failed to discover prover address for ${network.displayName}: ${errorMsg}`);
    return null;
  }
}

/**
 * Post a batch to a specific EVM network
 */
async function postBatchToEvmNetwork(
  network: EvmNetworkConfig,
  batch: SimpleBatch,
  proverAddress: string,
  logger: ILoggingService,
  latestBatchOnContract?: SimpleBatch
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    logger.info(`📤 Posting batch ${batch.batchNumber} to ${network.displayName}...`);
    
    if (!evmPrivateKey) {
      throw new Error('EVM_PRIVATE_KEY not configured');
    }

    // Validate and format private key for viem
    if (!evmPrivateKey || evmPrivateKey.length === 0) {
      throw new Error('EVM_PRIVATE_KEY environment variable is not set');
    }
    
    const cleanPrivateKey = evmPrivateKey.startsWith('0x') ? evmPrivateKey.slice(2) : evmPrivateKey;
    if (!/^[0-9a-fA-F]{64}$/.test(cleanPrivateKey)) {
      throw new Error(`Invalid private key format. Expected 64 hex characters, got: ${cleanPrivateKey.length} characters`);
    }
    
    const formattedPrivateKey = `0x${cleanPrivateKey}` as `0x${string}`;
    const account = privateKeyToAccount(formattedPrivateKey);
    logger.info(`📡 Using EVM account: ${account.address}`);

    // Check if batch has required signature data
    if (!batch.batchSignatures || batch.batchSignatures.length === 0) {
      logger.warn(`⚠️ Batch ${batch.batchNumber} has no signatures - cannot post to production`);
      return { success: false, error: 'Batch has no validator signatures - production posting requires signatures' };
    }

    if (!batch.validatorEntries || batch.validatorEntries.length === 0) {
      logger.warn(`⚠️ Batch ${batch.batchNumber} has no validator entries - cannot post to production`);
      return { success: false, error: 'Batch has no validator entries - production posting requires validator data' };
    }

    logger.info(`🔐 Processing signatures for production batch posting...`);
    logger.info(`   📝 Signatures available: ${batch.batchSignatures.length}`);
    logger.info(`   👥 Validators available: ${batch.validatorEntries.length}`);

    // For production posting, we need the latest batch on contract for signature validation
    // If not provided, we need to fetch it
    let referenceBatch = latestBatchOnContract;
    if (!referenceBatch) {
      logger.info(`🔍 Fetching latest batch from ${network.displayName} for signature validation...`);
      
      const transport = http(network.rpcUrl);
      const publicClient = createPublicClient({ transport });
      
      try {
        const lastBatchHeight = await publicClient.readContract({
          address: proverAddress as `0x${string}`,
          abi: iProver,
          functionName: 'getLastBatchHeight',
          args: []
        }) as bigint;

        if (lastBatchHeight > 0n) {
          logger.warn(`⚠️ Cannot validate signatures without reference batch from contract. Latest height: ${lastBatchHeight}`);
          logger.warn(`⚠️ Production batch posting requires signature validation against known validator set`);
        }
      } catch (error) {
        logger.error(`❌ Failed to get latest batch height: ${error instanceof Error ? error.message : error}`);
      }
      
      // For now, proceed with available signatures but log the limitation
      logger.warn(`⚠️ Proceeding without reference batch - signature validation limited`);
    }

    // Build validator merkle tree from validator entries (matching solver-sdk approach)
    const validatorTreeLeaves = batch.validatorEntries.map((validator: any, index: number) => {
      // Use toHex() to properly handle the ETH address (same as solver-sdk)
      const ethAddressHex = toHex(validator.ethAddress);
      
      // Ensure votingPowerPercent is a proper number
      const votingPowerPercent = typeof validator.votingPowerPercent === 'number' 
        ? validator.votingPowerPercent 
        : Number(validator.votingPowerPercent);
      
      logger.debug(`🔍 Processing validator ${index}: ethAddress=${ethAddressHex}, votingPower=${votingPowerPercent}`);
      logger.debug(`   Validator Address: ${Buffer.from(validator.validatorAddress).toString('hex')}`);
      logger.debug(`   ETH Address type: ${typeof validator.ethAddress}`);
      logger.debug(`   ETH Address toHex: ${ethAddressHex}`);
      
      return keccak256(
        encodePacked(
          ["bytes1", "bytes", "uint32"],
          [
            SECP256K1_DOMAIN_SEPARATOR,
            ethAddressHex,
            votingPowerPercent,
          ],
        ),
      );
    });

    const validatorTree = SimpleMerkleTree.of(validatorTreeLeaves, { sortLeaves: true });

    // Process signatures and build proofs
    let totalVotingPower = 0;
    const processedSignatures: any[] = [];
    const validatorProofs: any[] = [];
    const ethereumSignatures: string[] = [];

    for (const signature of batch.batchSignatures) {
      try {
        // Find corresponding validator entry
        const validatorEntry = batch.validatorEntries.find((v: any) => 
          Buffer.from(v.validatorAddress).equals(signature.validatorAddress)
        );

        if (!validatorEntry) {
          logger.warn(`⚠️ Validator entry not found for signature from ${Buffer.from(signature.validatorAddress).toString('hex')}`);
          continue;
        }

        // Recover public key from signature
        // Note: batch.batchId might be a Uint8Array/Buffer, not a hex string
        const batchIdBuffer = Buffer.isBuffer(batch.batchId) 
          ? batch.batchId 
          : Buffer.from(batch.batchId);
        
        logger.debug(`🔍 Recovering public key for validator ${Buffer.from(signature.validatorAddress).toString('hex')}:`);
        logger.debug(`   Batch ID type: ${typeof batch.batchId}`);
        logger.debug(`   Batch ID (hex): ${batchIdBuffer.toString('hex')}`);
        logger.debug(`   Signature length: ${signature.secp256k1Signature.length}`);
        
        const publicKey = recoverSecp256k1PublicKey(
          signature.secp256k1Signature,
          batchIdBuffer
        );
        
        logger.debug(`   Recovered public key length: ${publicKey.length}`);
        logger.debug(`   Public key (hex): ${publicKey.toString('hex')}`);

        // Use the ETH address from validator entry (following solver-sdk approach)
        // The solver-sdk doesn't validate generated vs stored ETH addresses - it uses the stored one
        const validatorAddrHex = Buffer.from(signature.validatorAddress).toString('hex');
        const ethAddress = Buffer.from(validatorEntry.ethAddress);
        
        logger.debug(`🔍 Using ETH address from validator entry for ${validatorAddrHex}:`);
        logger.debug(`   ETH Address: ${ethAddress.toString('hex')}`);
        logger.debug(`   Public key: ${publicKey.toString('hex')}`);
        
        // Optional: Generate ETH address for comparison/debugging only
        const generatedEthAddress = createEthAddress(publicKey);
        const generatedEthAddrHex = generatedEthAddress.toString('hex');
        const storedEthAddrHex = ethAddress.toString('hex');
        
        if (generatedEthAddrHex.toLowerCase() === storedEthAddrHex.toLowerCase()) {
          logger.debug(`   ✅ Generated ETH address matches stored address`);
        } else {
          logger.debug(`   ℹ️ Generated ETH address differs from stored (using stored):`);
          logger.debug(`     Generated: ${generatedEthAddrHex}`);
          logger.debug(`     Stored:    ${storedEthAddrHex}`);
        }

        // Generate merkle proof for this validator (matching solver-sdk approach)
        const validatorEthAddressHex = toHex(validatorEntry.ethAddress);
        
        // Ensure votingPowerPercent is a proper number
        const validatorVotingPowerPercent = typeof validatorEntry.votingPowerPercent === 'number' 
          ? validatorEntry.votingPowerPercent 
          : Number(validatorEntry.votingPowerPercent);
        
        const leaf = keccak256(
          encodePacked(
            ["bytes1", "bytes", "uint32"],
            [
              SECP256K1_DOMAIN_SEPARATOR,
              validatorEthAddressHex,
              validatorVotingPowerPercent,
            ],
          ),
        );

        const proof = validatorTree.getProof(leaf);

        // Convert signature to Ethereum format
        const extendedSig = ExtendedSecp256k1Signature.fromFixedLength(signature.secp256k1Signature);
        const recoveryId = extendedSig.recovery + 27;
        const ethereumSig = Buffer.concat([
          extendedSig.r(32),
          extendedSig.s(32),
          Buffer.from([recoveryId])
        ]);

        // Convert proof elements to proper format
        const formattedProof = proof.map((p: any) => {
          const hexString = typeof p === 'string' ? p : p.toString();
          return strip0x(hexString);
        });

        // Add to collections
        totalVotingPower += validatorVotingPowerPercent;
        
        processedSignatures.push({
          validatorAddr: Buffer.from(signature.validatorAddress).toString('hex'),
          ethAddress,
          votingPowerPercentage: validatorVotingPowerPercent,
          signature: ethereumSig,
          proof: formattedProof.map((p: string) => Buffer.from(p, 'hex'))
        });

        validatorProofs.push({
          signer: add0x(ethAddress.toString('hex')),
          votingPower: validatorVotingPowerPercent,
          merkleProof: formattedProof.map((p: string) => add0x(p))
        });

        ethereumSignatures.push(add0x(ethereumSig.toString('hex')));

        logger.info(`✅ Processed signature from validator ${ethAddress.toString('hex')} (power: ${validatorEntry.votingPowerPercent})`);

      } catch (error) {
        logger.warn(`⚠️ Failed to process signature: ${error instanceof Error ? error.message : error}`);
        continue;
      }
    }

    logger.info(`🔐 Signature processing complete:`);
    logger.info(`   ✅ Valid signatures: ${processedSignatures.length}`);
    logger.info(`   ⚖️ Total voting power: ${totalVotingPower}`);
    logger.info(`   📊 Required threshold: ${CONSENSUS_PERCENTAGE} (66.67%)`);

    // Check consensus threshold
    if (totalVotingPower < CONSENSUS_PERCENTAGE) {
      const powerPercent = (totalVotingPower / 1_000_000).toFixed(2);
      return { 
        success: false, 
        error: `Insufficient voting power: ${powerPercent}% < 66.67% consensus threshold` 
      };
    }

    // Sort signatures lexicographically by ETH address (required by contract)
    const sortedIndices = processedSignatures
      .map((sig, index) => ({ sig, index }))
      .sort((a, b) => a.sig.ethAddress.toString('hex').localeCompare(b.sig.ethAddress.toString('hex')))
      .map(item => item.index);

    const sortedValidatorProofs = sortedIndices.map(i => validatorProofs[i]);
    const sortedEthereumSignatures = sortedIndices.map(i => ethereumSignatures[i]).filter((sig): sig is `0x${string}` => sig !== undefined);

    // Create EVM batch structure
    const validatorRootHex = typeof batch.validatorRoot === 'string' ? batch.validatorRoot : Buffer.from(batch.validatorRoot).toString('hex');
    const dataResultRootHex = typeof batch.dataResultRoot === 'string' ? batch.dataResultRoot : Buffer.from(batch.dataResultRoot).toString('hex');
    
    const evmBatch = {
      batchHeight: BigInt(batch.batchNumber),
      blockHeight: BigInt(batch.blockHeight),
      validatorsRoot: add0x(validatorRootHex),
      resultsRoot: add0x(dataResultRootHex),
      provingMetadata: add0x(
        Buffer.from(padBytes(Buffer.alloc(32), { size: 32 })).toString('hex')
      ),
    };

    logger.info(`📋 Posting production batch to ${network.displayName}:`);
    logger.info(`   🔢 Batch Height: ${evmBatch.batchHeight}`);
    logger.info(`   📦 Block Height: ${evmBatch.blockHeight}`);
    logger.info(`   🌳 Validators Root: ${evmBatch.validatorsRoot}`);
    logger.info(`   🎯 Results Root: ${evmBatch.resultsRoot}`);
    logger.info(`   📝 Signatures: ${sortedEthereumSignatures.length}`);
    logger.info(`   🔐 Proofs: ${sortedValidatorProofs.length}`);

    // Create wallet and public clients for transaction
    const transport = http(network.rpcUrl);
    const walletClient = createWalletClient({
      account,
      transport
    });
    const publicClient = createPublicClient({ transport });

    // Simulate the contract call first to get proper gas estimation
    logger.info(`🔍 Simulating batch posting transaction...`);
    const simulation = await publicClient.simulateContract({
      account,
      address: proverAddress as `0x${string}`,
      abi: abiSecp256k1ProverV1,
      functionName: 'postBatch',
      args: [evmBatch, sortedEthereumSignatures, sortedValidatorProofs],
    });

    logger.info(`✅ Simulation successful, executing transaction...`);

    // Execute the transaction using the simulation result
    const txHash = await walletClient.writeContract(simulation.request);

    logger.info(`📡 Transaction submitted: ${txHash}`);
    logger.info(`⏳ Waiting for transaction confirmation...`);

    // Wait for transaction receipt to ensure it's mined
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    logger.info(`✅ Successfully posted production batch ${batch.batchNumber} to ${network.displayName}`);
    logger.info(`   🔗 Transaction hash: ${txHash}`);
    logger.info(`   📦 Block number: ${receipt.blockNumber}`);
    logger.info(`   ⛽ Gas used: ${receipt.gasUsed}`);
    
    return { success: true, txHash };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Failed to post batch to ${network.displayName}:`, errorMessage);
    
    // Handle specific error types
    if (errorMessage.includes('BatchAlreadyExists')) {
      return { success: false, error: 'Batch already exists on chain' };
    }
    if (errorMessage.includes('ConsensusNotReached')) {
      return { success: false, error: 'Consensus not reached on chain' };
    }
    if (errorMessage.includes('EnforcedPause')) {
      return { success: false, error: 'Contract is paused' };
    }
    
    return { success: false, error: errorMessage };
  }
}

/**
 * Check if a batch exists on a specific EVM network, and post it if missing
 */
async function checkAndPostBatchOnEvmNetwork(
  network: EvmNetworkConfig,
  batch: SimpleBatch,
  logger: ILoggingService
): Promise<{ networkName: string; batchExists: boolean; lastBatchHeight: bigint | null; posted?: boolean; txHash?: string; error?: string }> {
  try {
    logger.info(`🔍 Checking batch ${batch.batchNumber} on ${network.displayName}...`);
    
    // First, discover the prover contract address
    const proverAddress = await discoverProverAddress(network, logger);
    
    if (!proverAddress) {
      return {
        networkName: network.displayName,
        batchExists: false,
        lastBatchHeight: null,
        error: 'Failed to discover prover contract address'
      };
    }
    
    // Create public client for this network
    const transport = http(network.rpcUrl);
    const publicClient = createPublicClient({ transport });
    
    // Get the last batch height from the prover contract
    const lastBatchHeight = await publicClient.readContract({
      address: proverAddress as `0x${string}`,
      abi: iProver,
      functionName: 'getLastBatchHeight',
      args: []
    }) as bigint;
    
    const batchExists = lastBatchHeight >= batch.batchNumber;
    
    if (batchExists) {
      logger.info(`✅ ${network.displayName}: Batch ${batch.batchNumber} EXISTS (last height: ${lastBatchHeight})`);
      
      return {
        networkName: network.displayName,
        batchExists: true,
        lastBatchHeight,
      };
    } else {
      logger.info(`❌ ${network.displayName}: Batch ${batch.batchNumber} MISSING (last height: ${lastBatchHeight})`);
      
      // Attempt to post the missing batch
      logger.info(`🚀 Attempting to post missing batch ${batch.batchNumber} to ${network.displayName}...`);
      
      const postResult = await postBatchToEvmNetwork(network, batch, proverAddress, logger);
      
      return {
        networkName: network.displayName,
        batchExists: false,
        lastBatchHeight,
        posted: postResult.success,
        txHash: postResult.txHash,
        error: postResult.error
      };
    }
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.warn(`⚠️ Failed to check/post batch on ${network.displayName}: ${errorMsg}`);
    
    return {
      networkName: network.displayName,
      batchExists: false,
      lastBatchHeight: null,
      error: errorMsg
    };
  }
}

/**
 * Initialize EVM network prover addresses (optional optimization)
 * This pre-discovers all prover contract addresses to speed up batch checking
 */
async function initializeEvmNetworkProvers(logger: ILoggingService): Promise<void> {
  const enabledNetworks = getEnabledEvmNetworks();
  
  if (enabledNetworks.length === 0) {
    return;
  }
  
  logger.info(`🚀 Initializing prover contracts for ${enabledNetworks.length} EVM networks...`);
  
  // Discover all prover addresses in parallel
  const discoveries = await Promise.all(
    enabledNetworks.map(network => 
      discoverProverAddress(network, logger)
    )
  );
  
  const successCount = discoveries.filter(addr => addr !== null).length;
  logger.info(`✅ Successfully discovered ${successCount}/${enabledNetworks.length} prover contracts`);
}

/**
 * Check and post batch to all EVM networks in parallel
 */
async function checkAndPostBatchOnAllEvmNetworks(
  batch: SimpleBatch,
  logger: ILoggingService
): Promise<Array<{ networkName: string; batchExists: boolean; lastBatchHeight: bigint | null; posted?: boolean; txHash?: string; error?: string }>> {
  const enabledNetworks = getEnabledEvmNetworks();
  
  if (enabledNetworks.length === 0) {
    logger.info('📡 No EVM networks configured - skipping batch checking');
    return [];
  }
  
  logger.info(`\n🌐 Checking and posting batch ${batch.batchNumber} on ${enabledNetworks.length} EVM networks in parallel...`);
  logger.info('┌─────────────────────────────────────────────────────────────────────┐');
  logger.info('│                    🔍 EVM Batch Check & Post                        │');
  logger.info('├─────────────────────────────────────────────────────────────────────┤');
  
  // Check and post to all networks in parallel
  const results = await Promise.all(
    enabledNetworks.map(network => 
      checkAndPostBatchOnEvmNetwork(network, batch, logger)
    )
  );
  
  // Log summary
  const existsCount = results.filter((r: any) => r.batchExists).length;
  const postedCount = results.filter((r: any) => r.posted).length;
  const errorCount = results.filter((r: any) => r.error).length;
  
  logger.info('├─────────────────────────────────────────────────────────────────────┤');
  logger.info(`│ Summary: ${existsCount}/${enabledNetworks.length} networks have batch ${batch.batchNumber}`);
  if (postedCount > 0) {
    logger.info(`│ Posted: ${postedCount} networks received batch posting attempts`);
  }
  if (errorCount > 0) {
    logger.info(`│ Errors: ${errorCount} networks failed to respond`);
  }
  logger.info('└─────────────────────────────────────────────────────────────────────┘');
  
  return results;
}

// Export the initialization function for use by the application
export { initializeEvmNetworkProvers }; 