import { abiSecp256k1ProverV1, iProver } from "@seda-protocol/solver-evm-abi";
import type { Batch } from "@seda-protocol/solver-sdk";
import type { Secp256k1BatchSignature } from "@seda-protocol/solver-sdk/src/models/batch";
import { createEthAddress } from "@seda-protocol/solver-sdk/src/services/secp256k1";
import { Result, Unit } from "true-myth";
import { getAbiItem, padBytes } from "viem";
import type { BatchesWatcherConfig } from "../../../config-parser";
import {
	BatchAlreadyExists,
	BatchConsensusNotReached,
	ContractPaused,
} from "../../../errors";
import type { Network } from "../../../models/network";
import { EvmNetwork } from "../../../networks/evm/evm-network";
import { type Hex, add0x } from "../../../services/hex";
import type { EvmBatch } from "../../common/evm/evm-batch";
import type { BatchNetworkAdapter } from "../batch-network-adapter";
import { BatchesWatcher } from "../batches-watcher";

// 66.666666%, represented as parts per 100,000,000
const CONSENSUS_PERCENTAGE = 66_666_666;

const AbiConsensusNotReached = getAbiItem({
	abi: abiSecp256k1ProverV1,
	name: "ConsensusNotReached",
});

const AbiBatchAlreadyExists = getAbiItem({
	abi: abiSecp256k1ProverV1,
	name: "BatchAlreadyExists",
});

const AbiEnforcedPause = getAbiItem({
	abi: abiSecp256k1ProverV1,
	name: "EnforcedPause",
});

interface EvmValidatorProof {
	signer: Hex;
	votingPower: number;
	merkleProof: Hex[];
}

export class BatchEvmAdapter implements BatchNetworkAdapter {
	constructor(
		private network: EvmNetwork,
		private config: BatchesWatcherConfig,
	) {}

	static create(
		network: Network,
		config: BatchesWatcherConfig,
	): BatchNetworkAdapter {
		return new BatchEvmAdapter(network, config);
	}

	async getProverIdentifier(): Promise<string> {
		return `${this.config.networkId}-${this.config.contractAddress}`;
	}

	async latestBatchHeight(): Promise<Result<bigint, Error>> {
		const response = await this.network.view(
			iProver,
			this.config.contractAddress,
			"getLastBatchHeight",
			[],
		);

		return response as unknown as Result<bigint, Error>;
	}

	async postBatch(
		unsortedBatch: Batch,
		latestBatchOnContract: Batch,
	): Promise<Result<Unit, Error>> {
		let totalVotingPower = 0;
		// Validator proofs need to be constructed with the validator entries as they are in the contract,
		// not the batch we're trying to post.
		const secp256k1Signatures: Secp256k1BatchSignature[] = [];

		for (const knownSignature of latestBatchOnContract.secp256k1Signatures) {
			// See if a known validator has participated in signing the new batch.
			// If not, we can skip it.
			const newSignature = unsortedBatch.secp256k1Signatures.find(
				(v) => v.validatorAddr === knownSignature.validatorAddr,
			);
			if (!newSignature) {
				continue;
			}

			// If the new signature is for a different ETH address the validator must have rotated
			// their key in a previous batch and we should not include it in the proof, as the contract
			// will reject it.
			const newEthAddress = createEthAddress(newSignature.publicKey).toString(
				"hex",
			);
			if (newEthAddress !== knownSignature.ethAddress.toString("hex")) {
				continue;
			}

			// The signature is from a validator public key that was known in the batch on the contract,
			// so we can add their voting power to the total.
			totalVotingPower += newSignature.votingPowerPercentage;

			// Use the known validator entry but replace the signature with the new one... This can be cleaner,
			// but will require a lot of refactoring so it's left for "later".
			const mergedSignature = {
				...knownSignature,
				signature: newSignature.signature,
			};

			secp256k1Signatures.push(mergedSignature);
		}

		// If the total voting power is less than the consensus threshold, we're trying to bridge a batch gap
		// that's too large. We reject the batch here to trigger the batch recovery process.
		if (totalVotingPower < CONSENSUS_PERCENTAGE) {
			return Result.err(
				new BatchConsensusNotReached(
					`Total voting power ${totalVotingPower} is less than the required ${CONSENSUS_PERCENTAGE}`,
				),
			);
		}

		// Sort the signatures lexicographically by their hex representation as required by the prover.
		secp256k1Signatures.sort((a, b) => {
			const hexA = a.ethAddress.toString("hex");
			const hexB = b.ethAddress.toString("hex");
			return hexA.localeCompare(hexB);
		});

		const batch = {
			...unsortedBatch,
			secp256k1Signatures,
		};

		const validatorProofs: EvmValidatorProof[] = batch.secp256k1Signatures.map(
			(entry) => {
				return {
					merkleProof: entry.proof.map((leaf) => add0x(leaf.toString("hex"))),
					signer: add0x(entry.ethAddress.toString("hex")),
					votingPower: entry.votingPowerPercentage,
				};
			},
		);

		const evmBatch: EvmBatch = {
			batchHeight: BigInt(batch.batchNumber),
			blockHeight: BigInt(batch.blockHeight),
			provingMetadata: add0x(
				Buffer.from(padBytes(Buffer.alloc(32), { size: 32 })).toString("hex"),
			),
			resultsRoot: add0x(batch.dataResultRoot),
			validatorsRoot: add0x(batch.validatorRoot),
		};

		const convertedSignatures = batch.secp256k1Signatures.map((v) =>
			v.signature.getEthereumSignature(),
		);

		const response = await this.network.call(
			abiSecp256k1ProverV1,
			this.config.contractAddress,
			"postBatch",
			[
				evmBatch,
				convertedSignatures.map((s) => add0x(s.toString("hex"))),
				validatorProofs,
			],
			this.config.gasLimit ? BigInt(this.config.gasLimit) : undefined,
			this.config.gasPrice ? BigInt(this.config.gasPrice) : undefined,
		);

		return response
			.map(() => Unit)
			.mapErr((err) => {
				if (err.message.includes(AbiConsensusNotReached.name)) {
					return new BatchConsensusNotReached(err.message, {
						cause: err.cause,
					});
				}

				if (err.message.includes(AbiBatchAlreadyExists.name)) {
					return new BatchAlreadyExists(err.message, {
						cause: err.cause,
					});
				}

				if (err.message.includes(AbiEnforcedPause.name)) {
					return new ContractPaused(err.message, {
						cause: err.cause,
					});
				}

				return err;
			});
	}

	isContractPaused(): Promise<Result<boolean, Error>> {
		return this.network.view(
			abiSecp256k1ProverV1,
			this.config.contractAddress,
			"paused",
			[],
		);
	}
}

BatchesWatcher.registerNetworkAdapter(EvmNetwork.type, BatchEvmAdapter);
