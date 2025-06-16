import { SimpleMerkleTree } from "@openzeppelin/merkle-tree";
import { sedachain } from "@seda-protocol/proto-messages";
import { tryAsync } from "@seda-protocol/utils";
import { Maybe, Result } from "true-myth";
import type { SedaChain } from "../chains/seda/seda-chain";
import {
	type DataResult,
	convertSedaChainDataResultToDataResult,
} from "../models/data-result";
import { getBatch, getBatches } from "./batch-service";
import { CacheCapacityMap } from "./cache";
import { strip0x } from "./hex";
import { keccak256 } from "./keccak256";

const dataResultsCache = new CacheCapacityMap<string, DataResult>(100);

function createCacheKey(dataRequestId: string, dataRequestHeight: bigint) {
	return `${dataRequestId}_${dataRequestHeight}`;
}

export async function getDataResult(
	dataRequestId: string,
	dataRequestHeight: bigint,
	sedaChain: SedaChain,
): Promise<Result<Maybe<DataResult>, Error>> {
	const cachedDataResult = dataResultsCache.get(
		createCacheKey(dataRequestId, dataRequestHeight),
	);
	if (cachedDataResult.isJust) {
		return Result.ok(cachedDataResult);
	}

	const client = new sedachain.batching.v1.QueryClientImpl(
		sedaChain.getProtobufRpcClient(),
	);

	const dataResult: Result<Maybe<DataResult>, Error> = (
		await tryAsync(client.DataResult({ dataRequestId, dataRequestHeight }))
	).map((result) => {
		if (!result.batchAssignment) return Maybe.nothing();
		if (!result.dataResult) return Maybe.nothing();

		return Maybe.just(
			convertSedaChainDataResultToDataResult(
				result.dataResult,
				result.batchAssignment.batchNumber,
			),
		);
	});

	if (dataResult.isErr) {
		if (dataResult.error.message.includes("not found")) {
			return Result.ok(Maybe.nothing());
		}

		return Result.err(dataResult.error);
	}

	if (dataResult.value.isNothing) {
		return Result.ok(Maybe.nothing());
	}

	dataResultsCache.set(
		createCacheKey(dataRequestId, dataRequestHeight),
		dataResult.value.value,
	);

	return dataResult;
}

/**
 * Gets the merkle proof for a data result in a specific batch
 * @param dataRequestId - The ID of the data request to get the proof for
 * @param sedaChain - The SEDA chain instance to query
 * @param targetBatch - The batch number to get the proof from
 * @returns A Result containing either:
 * - An array of hex strings representing the merkle proof
 * - An Error if the proof could not be generated
 */

export async function getDataResultProof(
	dataRequestId: string,
	dataRequestHeight: bigint,
	sedaChain: SedaChain,
	targetBatch?: bigint,
): Promise<Result<string[], Error>> {
	const dataResultResponse = await getDataResult(
		dataRequestId,
		dataRequestHeight,
		sedaChain,
	);

	if (dataResultResponse.isErr) {
		return Result.err(dataResultResponse.error);
	}

	if (dataResultResponse.value.isNothing) {
		return Result.err(
			new Error(`Data result for ${dataRequestId} was not found`),
		);
	}

	const dataResult = dataResultResponse.value.value;

	if (targetBatch) {
		if (dataResult.batchAssignment > targetBatch) {
			return Result.err(
				new Error(
					`Data Request was assigned batch ${dataResult.batchAssignment} but given target was ${targetBatch}`,
				),
			);
		}
	}

	const dataResultBatchDetails = await getBatch(
		dataResult.batchAssignment,
		sedaChain,
	);

	if (dataResultBatchDetails.isErr) {
		return Result.err(dataResultBatchDetails.error);
	}

	if (dataResultBatchDetails.value.isNothing) {
		return Result.err(
			new Error(`Details were empty for batch #${dataResult.batchAssignment}`),
		);
	}

	const { dataResultEntries: treeEntries } = dataResultBatchDetails.value.value;

	// We need to retrieve all the batches that were in between the assignment and the target
	// start is always the current batch - 1 (we always need atleast the previous batch to calculate the tree)
	const start = BigInt(dataResult.batchAssignment) - 1n;
	const end = targetBatch
		? BigInt(targetBatch)
		: BigInt(dataResult.batchAssignment);

	const batches = await getBatches(start, end, sedaChain);

	if (batches.isErr) {
		return Result.err(batches.error);
	}

	const dataResultBatch = Maybe.of(
		batches.value.find(
			(batch) => batch.batchNumber === dataResult.batchAssignment,
		),
	);

	const previousBatch = Maybe.of(
		batches.value.find(
			(batch) => batch.batchNumber === dataResult.batchAssignment - 1n,
		),
	);

	if (dataResultBatch.isNothing) {
		return Result.err(
			new Error(`Could not find assigned batch #${dataResult.batchAssignment}`),
		);
	}

	if (previousBatch.isNothing) {
		return Result.err(
			new Error(
				`Could not find previous batch #${dataResult.batchAssignment - 1n}`,
			),
		);
	}

	const dataResultEntries = treeEntries.map((entry) =>
		keccak256(Buffer.concat([Buffer.from([0]), Buffer.from(entry)])),
	);

	// Generate the normal data result tree (Previous batch is not included)
	const dataResultTree = SimpleMerkleTree.of(dataResultEntries ?? [], {
		sortLeaves: true,
	});

	const dataResultMerkleRootBuffer = Buffer.from(
		strip0x(dataResultTree.root),
		"hex",
	);
	const previousDataResultRootBuffer = Buffer.from(
		previousBatch.value.dataResultRoot,
		"hex",
	);

	// Generate the tree which includes the previous batch
	const finalTree = SimpleMerkleTree.of(
		[dataResultMerkleRootBuffer, previousDataResultRootBuffer],
		{
			sortLeaves: true,
		},
	);

	if (
		strip0x(finalTree.root) !== strip0x(dataResultBatch.value.dataResultRoot)
	) {
		return Result.err(
			new Error(
				`Generated tree root ${strip0x(finalTree.root)} did not match chain tree root ${strip0x(dataResultBatch.value.dataResultRoot)}`,
			),
		);
	}

	const dataResultIdEntry = keccak256(
		Buffer.concat([
			Buffer.from("00", "hex"),
			Buffer.from(dataResult.id, "hex"),
		]),
	);

	const proof = dataResultTree
		.getProof(dataResultIdEntry)
		  .map((entry: string) => strip0x(entry));

	// Always push the previous root, since that is the one that is being used to calculate the dataResultRoot of the batch that this data result is in
	proof.push(previousBatch.value.dataResultRoot);

	for (const batch of batches.value) {
		// We do not need to add the current batch to the proof. (Since the proof is for the current batch)
		if (batch.batchNumber === dataResultBatch.value.batchNumber) {
			continue;
		}

		// The previous batch should also not be pushed, since the dataResultRoot should be pushed in the end (always)
		// not the currentDataResultRoot
		if (batch.batchNumber === previousBatch.value.batchNumber) {
			continue;
		}

		proof.push(batch.currentDataResultRoot);
	}

	return Result.ok(proof);
}
