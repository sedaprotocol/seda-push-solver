/**
 * EVM Batch Poster
 * Handles posting batches to EVM networks with signature validation
 */

import type { ILoggingService } from '../services';
import type { SignedBatch, EvmNetworkConfig, BatchPostingResult } from '../types';
import type { HexString } from '../utils/hex';
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
import { abiSecp256k1ProverV1 } from './abi/abi-secp256k1-prover-v1.abi';

export class BatchPoster {
  constructor(private logger: ILoggingService) {}

  /**
   * Post a batch to an EVM network
   */
  async postBatch(
    network: EvmNetworkConfig,
    batch: SignedBatch,
    proverAddress: string
  ): Promise<BatchPostingResult> {
    try {
      this.logger.info(`📤 Posting batch ${batch.batchNumber} to ${network.displayName}...`);
      
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

      this.logger.info(`✅ Successfully posted batch ${batch.batchNumber} to ${network.displayName}`);
      this.logger.info(`   🔗 Transaction hash: ${txHash}`);
      
      return { success: true, txHash };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Failed to post batch to ${network.displayName}:`, errorMessage);
      
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
    proofs?: Array<{ signer: HexString; votingPower: number; merkleProof: HexString[] }>;
  }> {
    this.logger.info(`🔐 Processing signatures for batch posting...`);
    this.logger.info(`   📝 Signatures available: ${batch.batchSignatures!.length}`);
    this.logger.info(`   👥 Validators available: ${batch.validatorEntries!.length}`);

    // Generate merkle tree for validators
    const merkleGenerator = new MerkleProofGenerator(this.logger);
    const validatorTree = merkleGenerator.buildValidatorTree(
      batch.validatorEntries!,
      '0x01' // SECP256K1_DOMAIN_SEPARATOR
    );

    let totalVotingPower = 0;
    const processedSignatures: any[] = [];
    const validatorProofs: any[] = [];
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
          
          this.logger.info(`✅ Processed signature from validator (power: ${result.data.votingPower})`);
        } else {
          this.logger.warn(`⚠️ Failed to process signature: ${result.error}`);
        }
      } catch (error) {
        this.logger.warn(`⚠️ Failed to process signature: ${error instanceof Error ? error.message : error}`);
      }
    }

    this.logger.info(`🔐 Signature processing complete:`);
    this.logger.info(`   ✅ Valid signatures: ${processedSignatures.length}`);
    this.logger.info(`   ⚖️ Total voting power: ${totalVotingPower}`);
    this.logger.info(`   📊 Required threshold: ${CONSENSUS_PERCENTAGE} (66.67%)`);

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
        ethereumSignature: HexUtils.addPrefix(ethereumSig.toString('hex')),
        proof: {
          signer: HexUtils.addPrefix(Buffer.from(validatorEntry.ethAddress).toString('hex')),
          votingPower: votingPowerPercent,
          merkleProof: proof.map((p: string) => HexUtils.addPrefix(p))
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
      validatorsRoot: HexUtils.addPrefix(validatorRootHex),
      resultsRoot: HexUtils.addPrefix(dataResultRootHex),
      provingMetadata: HexUtils.addPrefix(
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
    // Validate and format private key
    const cleanPrivateKey = evmPrivateKey.startsWith('0x') ? evmPrivateKey.slice(2) : evmPrivateKey;
    if (!/^[0-9a-fA-F]{64}$/.test(cleanPrivateKey)) {
      throw new Error(`Invalid private key format. Expected 64 hex characters, got: ${cleanPrivateKey.length} characters`);
    }
    
    const formattedPrivateKey = `0x${cleanPrivateKey}` as HexString;
    const account = privateKeyToAccount(formattedPrivateKey);
    
    this.logger.info(`📋 Posting batch to ${network.displayName}:`);
    this.logger.info(`   🔢 Batch Height: ${evmBatch.batchHeight}`);
    this.logger.info(`   📦 Block Height: ${evmBatch.blockHeight}`);
    this.logger.info(`   📝 Signatures: ${signatures.length}`);
    this.logger.info(`   🔐 Proofs: ${proofs.length}`);

    // Create clients
    const transport = http(network.rpcUrl);
    const walletClient = createWalletClient({ account, transport });
    const publicClient = createPublicClient({ transport });

    // Simulate transaction
    this.logger.info(`🔍 Simulating batch posting transaction...`);
    const simulation = await publicClient.simulateContract({
      account,
      address: proverAddress as HexString,
      abi: abiSecp256k1ProverV1,
      functionName: 'postBatch',
      args: [evmBatch, signatures, proofs],
    });

    this.logger.info(`✅ Simulation successful, executing transaction...`);

    // Execute transaction
    const txHash = await walletClient.writeContract(simulation.request);
    this.logger.info(`📡 Transaction submitted: ${txHash}`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    this.logger.info(`📦 Block number: ${receipt.blockNumber}`);
    this.logger.info(`⛽ Gas used: ${receipt.gasUsed}`);

    return txHash;
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
} 