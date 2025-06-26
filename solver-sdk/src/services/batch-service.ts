import { SimpleMerkleTree } from "@openzeppelin/merkle-tree";
import { sedachain } from "@seda-protocol/proto-messages";
import { tryAsync } from "@seda-protocol/utils";
import { Maybe, Result } from "true-myth";
import { encodePacked, keccak256, toHex } from "viem";
import type { SedaChain } from "../chains/seda/seda-chain";
import {
	type Batch,
	type Secp256k1BatchSignature,
	type UnsignedBatch,
	convertSedaChainBatchToBatch,
	convertSedaChainBatchToUnsignedBatch,
} from "../models/batch";
import { Secp256k1Signature } from "../models/batch-signature";
import { CacheCapacityMap } from "./cache";
import { strip0x } from "./hex";
import { recoverSecp256k1PublicKey } from "./secp256k1";

const batchDetailCache = new CacheCapacityMap<bigint, Batch>(100);
const SECP256K1_DOMAIN_SEPARATOR = "0x01";

export async function getBatch(
	batchNumber: bigint,
	sedaChain: SedaChain,
): Promise<Result<Maybe<Batch>, Error>> {
	const cachedBatch = batchDetailCache.get(batchNumber);
	if (cachedBatch.isJust) {
		return Result.ok(Maybe.just(cachedBatch.value));
	}

	return getBatchFromSedaChain(batchNumber, sedaChain, false);
}

/**
 * Hide the weird implementation detail of the seda chain
 * ignoring the batchNumber parameter when latestSigned is true
 * and always returning the latest signed batch in that case.
 */
async function getBatchFromSedaChain(
	batchNumber: bigint,
	sedaChain: SedaChain,
	latestSigned: boolean,
): Promise<Result<Maybe<Batch>, Error>> {
	const client = new sedachain.batching.v1.QueryClientImpl(
		sedaChain.getProtobufRpcClient(),
	);

	const response = await tryAsync(client.Batch({ batchNumber, latestSigned }));

	if (response.isErr) {
		if (response.error.message.includes("not found")) {
			return Result.ok(Maybe.nothing());
		}

		return Result.err(response.error);
	}

	if (
		!response.value.batch ||
		!response.value.dataResultEntries ||
		response.value.batchSignatures.length === 0 ||
		response.value.validatorEntries.length === 0
	) {
		return Result.ok(Maybe.nothing());
	}

	const { batch, batchSignatures, dataResultEntries, validatorEntries } =
		response.value;

	const validatorTree = SimpleMerkleTree.of(
		validatorEntries.map((v) => {
			return keccak256(
				encodePacked(
					["bytes1", "bytes", "uint32"],
					[
						SECP256K1_DOMAIN_SEPARATOR,
						toHex(v.ethAddress),
						v.votingPowerPercent,
					],
				),
			);
		}),
		{ sortLeaves: true },
	);

	const secp256k1Signatures: Secp256k1BatchSignature[] = [];

	for (const batchSignature of batchSignatures) {
		const validatorEntry = validatorEntries.find((v) =>
			Buffer.from(v.validatorAddress).equals(batchSignature.validatorAddress),
		);
		if (!validatorEntry) continue;

		const publicKey = recoverSecp256k1PublicKey(
			batchSignature.secp256k1Signature,
			Buffer.from(batch.batchId),
		);
		const leaf = keccak256(
			encodePacked(
				["bytes1", "bytes", "uint32"],
				[
					SECP256K1_DOMAIN_SEPARATOR,
					toHex(validatorEntry.ethAddress),
					validatorEntry.votingPowerPercent,
				],
			),
		);
		const proof = validatorTree
			.getProof(leaf)
			.map((v) => Buffer.from(strip0x(v), "hex"));

		secp256k1Signatures.push({
			ethAddress: Buffer.from(validatorEntry.ethAddress),
			votingPowerPercentage: validatorEntry.votingPowerPercent,
			signature: new Secp256k1Signature(
				Buffer.from(batchSignature.secp256k1Signature),
			),
			validatorAddr: Buffer.from(validatorEntry.validatorAddress).toString(
				"hex",
			),
			proof,
			publicKey,
		});
	}

	const result = convertSedaChainBatchToBatch(
		batch,
		secp256k1Signatures,
		dataResultEntries,
		validatorEntries,
	);

	batchDetailCache.set(result.batchNumber, result);

	return Result.ok(Maybe.just(result));
}

/**
 * Fetches all batches from start to end (all inclusive)
 *
 * @param startBatch
 * @param endBatch
 * @param sedaChain
 */
export async function getBatches(
	startBatch: bigint,
	endBatch: bigint,
	sedaChain: SedaChain,
): Promise<Result<UnsignedBatch[], Error>> {
	const client = new sedachain.batching.v1.QueryClientImpl(
		sedaChain.getProtobufRpcClient(),
	);

	const batchesResponse = await tryAsync(() =>
		client.Batches({
			withUnsigned: false,
			pagination: {
				reverse: false,
				countTotal: false,
				key: new Uint8Array(),
				limit: endBatch + 1n - startBatch,
				offset: startBatch,
			},
		}),
	);

	if (batchesResponse.isErr) {
		return Result.err(batchesResponse.error);
	}

	const result: UnsignedBatch[] = [];

	for (const batch of batchesResponse.value.batches) {
		const convertedBatch = convertSedaChainBatchToUnsignedBatch(batch);
		result.push(convertedBatch);
	}

	return Result.ok(result);
}

export async function getLatestBatch(
	sedaChain: SedaChain,
): Promise<Result<Batch, Error>> {
	// See comment in getBatchFromSedaChain for more details
	const batchDetails = await getBatchFromSedaChain(0n, sedaChain, true);

	if (batchDetails.isErr) {
		return Result.err(batchDetails.error);
	}

	if (batchDetails.value.isNothing) {
		return Result.err(new Error("No details for latest batch found"));
	}

	return Result.ok(batchDetails.value.value);
}
