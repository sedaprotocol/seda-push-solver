/**
 * EVM Batch Poster
 * Handles posting batches to EVM networks with signature validation
 */

import type { LoggingServiceInterface } from '../services';
import type { SignedBatch, EvmNetworkConfig, BatchPostingResult, ProcessedSignature, ValidatorProofData } from '../types';
import type { HexString } from '../utils/hex';
import { getErrorMessage } from '../helpers/error-utils';
import { HexUtils } from '../utils/hex';
import { SignatureProcessor } from '../crypto/signature-processor';
import { MerkleProofGenerator } from '../crypto/merkle-proof-generator';
import { CONSENSUS_PERCENTAGE } from '../crypto/constants';
import { evmPrivateKey } from '../../config';

import {
  http,
  createPublicClient,
  createWalletClient,
  encodePacked,
  keccak256,
  toHex,
  padBytes
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ABI_SECP256K1_PROVER_V1 } from './abi/abi-secp256k1-prover-v1.abi';

export class BatchPoster {
  constructor(private logger: LoggingServiceInterface) {}

  /**
   * Post a batch to an EVM network
   */
  async postBatch(
    network: EvmNetworkConfig,
    batch: SignedBatch,
    proverAddress: string
  ): Promise<BatchPostingResult> {
    try {
      this.logger.info(`Posting batch ${batch.batchNumber} to ${network.displayName}`);
      
      // Validate prerequisites
      const validationResult = this.validatePrerequisites(batch);
      if (!validationResult.valid) {
        return { success: false, error: validationResult.error };
      }

      // Process signatures and validate consensus
      const signatureResult = await this.processSignatures(batch);
      if (!signatureResult.success) {
        return { success: false, error: signatureResult.error };
      }

      // Create EVM batch structure
      const evmBatch = this.createEvmBatch(batch);

      // Post the batch to the network
      const txHash = await this.executeTransaction(
        network,
        proverAddress,
        evmBatch,
        signatureResult.signatures!,
        signatureResult.proofs!
      );

      this.logger.info(`Successfully posted batch ${batch.batchNumber} to ${network.displayName}`);
      this.logger.info(`TX Hash: ${txHash}`);
      this.logger.info(`Explorer: ${this.getExplorerUrl(network, txHash)}`);
      
      return { success: true, txHash };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to post batch to ${network.displayName}: ${errorMessage}`);
      
      return { 
        success: false, 
        error: this.categorizeError(errorMessage) 
      };
    }
  }

  /**
   * Validate batch prerequisites
   */
  private validatePrerequisites(batch: SignedBatch): { valid: boolean; error?: string } {
    if (!evmPrivateKey) {
      return { valid: false, error: 'EVM_PRIVATE_KEY not configured' };
    }

    if (!batch.batchSignatures || batch.batchSignatures.length === 0) {
      return { 
        valid: false, 
        error: 'Batch has no validator signatures - production posting requires signatures' 
      };
    }

    if (!batch.validatorEntries || batch.validatorEntries.length === 0) {
      return { 
        valid: false, 
        error: 'Batch has no validator entries - production posting requires validator data' 
      };
    }

    return { valid: true };
  }

  /**
   * Process signatures and generate proofs
   */
  private async processSignatures(batch: SignedBatch): Promise<{
    success: boolean;
    error?: string;
    signatures?: HexString[];
    proofs?: ValidatorProofData[];
  }> {
    this.logger.debug(`Processing ${batch.batchSignatures!.length} signatures (${batch.validatorEntries!.length} validators)`);

    // Generate merkle tree for validators
    const merkleGenerator = new MerkleProofGenerator(this.logger);
    const validatorTree = merkleGenerator.buildValidatorTree(
      batch.validatorEntries!,
      '0x01' // SECP256K1_DOMAIN_SEPARATOR
    );

    // CRITICAL: Validate that our locally generated merkle root matches the batch's validator root
    const localValidatorRoot = merkleGenerator.getTreeRoot(validatorTree);
    const batchValidatorRoot = typeof batch.validatorRoot === 'string' 
      ? HexUtils.normalize(batch.validatorRoot)
      : HexUtils.normalize(Buffer.from(batch.validatorRoot).toString('hex'));

    this.logger.info(`🔍 Validator Root Validation:`);
    this.logger.info(`   Local root:  ${localValidatorRoot}`);
    this.logger.info(`   Batch root:  ${batchValidatorRoot}`);

    if (localValidatorRoot.toLowerCase() !== batchValidatorRoot.toLowerCase()) {
      return {
        success: false,
        error: `Validator root mismatch! Local: ${localValidatorRoot}, Batch: ${batchValidatorRoot}. This indicates a problem with validator data structure or merkle tree generation.`
      };
    }

    this.logger.info(`✅ Validator root validation passed - proofs will be valid`);

    let totalVotingPower = 0;
    const processedSignatures: ProcessedSignature[] = [];
    const validatorProofs: ValidatorProofData[] = [];
    const ethereumSignatures: HexString[] = [];

    // Process each signature
    for (const signature of batch.batchSignatures!) {
      try {
        const result = this.processIndividualSignature(
          signature,
          batch,
          merkleGenerator,
          validatorTree
        );

        if (result.success && result.data) {
          totalVotingPower += result.data.votingPower;
          processedSignatures.push(result.data);
          validatorProofs.push(result.data.proof);
          ethereumSignatures.push(result.data.ethereumSignature);
          
          this.logger.debug(`Processed signature (power: ${result.data.votingPower})`);
        } else {
          this.logger.warn(`Failed to process signature: ${result.error}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to process signature: ${getErrorMessage(error)}`);
      }
    }

    const powerPercent = (totalVotingPower / 1_000_000).toFixed(2);
    this.logger.info(`Processed ${processedSignatures.length} signatures (${powerPercent}% voting power)`);

    // Check consensus threshold
    if (totalVotingPower < CONSENSUS_PERCENTAGE) {
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

    const sortedValidatorProofs = sortedIndices.map(i => validatorProofs[i]).filter((proof): proof is ValidatorProofData => proof !== undefined);
    const sortedEthereumSignatures = sortedIndices.map(i => ethereumSignatures[i]).filter((sig): sig is HexString => sig !== undefined);

    return {
      success: true,
      signatures: sortedEthereumSignatures,
      proofs: sortedValidatorProofs
    };
  }

  /**
   * Process an individual signature
   */
  private processIndividualSignature(
    signature: any,
    batch: SignedBatch,
    merkleGenerator: MerkleProofGenerator,
    validatorTree: any
  ): { success: boolean; error?: string; data?: any } {
    // Find corresponding validator entry
    const validatorEntry = batch.validatorEntries!.find((v: any) => 
      Buffer.from(v.validatorAddress).equals(signature.validatorAddress)
    );

    if (!validatorEntry) {
      return {
        success: false,
        error: `Validator entry not found for signature from ${Buffer.from(signature.validatorAddress).toString('hex')}`
      };
    }

    // Prepare batch ID for signature validation
    const batchIdBuffer = Buffer.isBuffer(batch.batchId) 
      ? batch.batchId 
      : Buffer.from(batch.batchId, 'hex');

    // Validate signature
    const validationResult = SignatureProcessor.validateSignature(
      signature.secp256k1Signature,
      batchIdBuffer,
      Buffer.from(validatorEntry.ethAddress)
    );

    if (!validationResult.valid) {
      return { success: false, error: validationResult.error };
    }

    // Generate merkle proof
    const proof = merkleGenerator.generateValidatorProof(validatorTree, validatorEntry, '0x01');

    // Convert signature to Ethereum format
    const ethereumSig = SignatureProcessor.toEthereumFormat(signature.secp256k1Signature);

    const votingPowerPercent = typeof validatorEntry.votingPowerPercent === 'number' 
      ? validatorEntry.votingPowerPercent 
      : Number(validatorEntry.votingPowerPercent);

    return {
      success: true,
      data: {
        ethAddress: Buffer.from(validatorEntry.ethAddress),
        votingPower: votingPowerPercent,
        ethereumSignature: HexUtils.normalize(ethereumSig.toString('hex')),
        proof: {
          signer: HexUtils.normalize(Buffer.from(validatorEntry.ethAddress).toString('hex')),
          votingPower: votingPowerPercent,
          merkleProof: proof.map((p: string) => HexUtils.normalize(p))
        }
      }
    };
  }

  /**
   * Create EVM batch structure
   */
  private createEvmBatch(batch: SignedBatch) {
    const validatorRootHex = typeof batch.validatorRoot === 'string' 
      ? batch.validatorRoot 
      : Buffer.from(batch.validatorRoot).toString('hex');
    
    const dataResultRootHex = typeof batch.dataResultRoot === 'string' 
      ? batch.dataResultRoot 
      : Buffer.from(batch.dataResultRoot).toString('hex');
    
    return {
      batchHeight: BigInt(batch.batchNumber),
      blockHeight: BigInt(batch.blockHeight),
      validatorsRoot: HexUtils.normalize(validatorRootHex),
      resultsRoot: HexUtils.normalize(dataResultRootHex),
      provingMetadata: HexUtils.normalize(
        Buffer.from(padBytes(Buffer.alloc(32), { size: 32 })).toString('hex')
      ),
    };
  }

  /**
   * Execute the batch posting transaction
   */
  private async executeTransaction(
    network: EvmNetworkConfig,
    proverAddress: string,
    evmBatch: any,
    signatures: HexString[],
    proofs: any[]
  ): Promise<string> {
    this.logger.debug(`📡 Posting batch ${evmBatch.batchHeight} to ${network.displayName}`);

    // Validate and format private key
    const formattedPrivateKey = this.formatPrivateKey(evmPrivateKey!);
    const account = privateKeyToAccount(formattedPrivateKey);
    
    // Create clients
    const publicClient = createPublicClient({
      chain: { id: network.chainId, name: network.displayName, nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [network.rpcUrl] } } },
      transport: http(network.rpcUrl)
    });

    const walletClient = createWalletClient({
      account,
      chain: { id: network.chainId, name: network.displayName, nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [network.rpcUrl] } } },
      transport: http(network.rpcUrl)
    });

    this.logger.debug(`🔍 Simulating transaction on ${network.displayName}...`);

    // Simulate the transaction first
    // try {
    //   await publicClient.simulateContract({
    //     account,
    //     address: proverAddress as `0x${string}`,
    //     abi: ABI_SECP256K1_PROVER_V1,
    //     functionName: 'postBatch',
    //     args: [evmBatch, signatures, proofs]
    //   });
    // } catch (error) {
    //   throw new Error(`Simulation failed: ${getErrorMessage(error)}`);
    // }

    // this.logger.debug(`✅ Simulation successful, executing on ${network.displayName}...`);

    // Execute the transaction
    const txHash = await walletClient.writeContract({
      address: proverAddress as `0x${string}`,
      abi: ABI_SECP256K1_PROVER_V1,
      functionName: 'postBatch',
      args: [evmBatch, signatures, proofs]
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    
    this.logger.debug(`📦 Block: ${receipt.blockNumber}, Gas: ${receipt.gasUsed}`);

    return txHash;
  }

  /**
   * Format and validate private key for viem
   */
  private formatPrivateKey(privateKey: string): `0x${string}` {
    if (!privateKey) {
      throw new Error('Private key is required for EVM operations');
    }

    // Remove any whitespace
    const cleanKey = privateKey.trim();
    
    // Remove 0x prefix if present
    const keyWithoutPrefix = cleanKey.startsWith('0x') ? cleanKey.slice(2) : cleanKey;
    
    // Validate hex format and length (64 characters = 32 bytes)
    if (keyWithoutPrefix.length !== 64) {
      throw new Error(`Invalid private key length. Expected 64 hex characters, got: ${keyWithoutPrefix.length}`);
    }
    
    if (!/^[0-9a-fA-F]+$/.test(keyWithoutPrefix)) {
      throw new Error(`Invalid private key format. Must contain only hex characters (0-9, a-f, A-F)`);
    }
    
    // Return with 0x prefix (lowercase for consistency)
    return `0x${keyWithoutPrefix.toLowerCase()}` as `0x${string}`;
  }

  /**
   * Categorize error messages for better handling
   */
  private categorizeError(errorMessage: string): string {
    if (errorMessage.includes('BatchAlreadyExists')) {
      return 'Batch already exists on chain';
    }
    if (errorMessage.includes('ConsensusNotReached')) {
      return 'Consensus not reached on chain';
    }
    if (errorMessage.includes('EnforcedPause')) {
      return 'Contract is paused';
    }
    
    return errorMessage;
  }

  /**
   * Get block explorer URL for transaction
   */
  private getExplorerUrl(network: EvmNetworkConfig, txHash: string): string {
    // First, check if explorerUrl is configured in the network config
    if (network.explorerUrl) {
      return `${network.explorerUrl}${txHash}`;
    }
    
    // Fallback to hardcoded explorer URLs for backward compatibility
    const defaultExplorers = {
      // Mainnet
      1: 'https://etherscan.io/tx/',
      8453: 'https://basescan.org/tx/',
      137: 'https://polygonscan.com/tx/',
      42161: 'https://arbiscan.io/tx/',
      10: 'https://optimistic.etherscan.io/tx/',
      
      // Testnets
      11155111: 'https://sepolia.etherscan.io/tx/',
      5: 'https://goerli.etherscan.io/tx/',
      84532: 'https://sepolia.basescan.org/tx/',
      80001: 'https://mumbai.polygonscan.com/tx/',
      421613: 'https://goerli.arbiscan.io/tx/',
      420: 'https://goerli-optimism.etherscan.io/tx/'
    };
    
    const baseUrl = defaultExplorers[network.chainId as keyof typeof defaultExplorers];
    return baseUrl ? `${baseUrl}${txHash}` : `Chain ${network.chainId}: ${txHash}`;
  }
} 