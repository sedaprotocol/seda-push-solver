import type { sedachain } from "@seda-protocol/proto-messages";

export interface DataResult {
	batchAssignment: bigint;
	version: string;
	id: string;
	drId: string;
	consensus: boolean;
	exitCode: number;
	result: Buffer;
	blockHeight: bigint;
	blockTimestamp: bigint;
	gasUsed: bigint;
	paybackAddress: Buffer;
	sedaPayload: Buffer;
}

export function convertSedaChainDataResultToDataResult(
	dataResult: sedachain.batching.v1.DataResult,
	batchAssignment: bigint,
): DataResult {
	const result: DataResult = {
		id: dataResult.id,
		blockHeight: dataResult.blockHeight,
		consensus: dataResult.consensus,
		drId: dataResult.drId,
		exitCode: dataResult.exitCode,
		gasUsed: BigInt(dataResult.gasUsed),
		paybackAddress: Buffer.from(dataResult.paybackAddress, "base64"),
		result: Buffer.from(dataResult.result),
		sedaPayload: Buffer.from(dataResult.sedaPayload, "base64"),
		version: dataResult.version,
		batchAssignment,
		blockTimestamp: dataResult.blockTimestamp,
	};

	return result;
}
