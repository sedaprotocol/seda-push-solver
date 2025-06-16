import type { iSedaCore } from "@seda-protocol/solver-evm-abi";
import type { DataRequest, DataResult } from "@seda-protocol/solver-sdk";
import type {
	AbiStateMutability,
	ContractFunctionArgs,
	ContractFunctionReturnType,
} from "viem";
import { add0x, strip0x } from "../../services/hex";

export type DataRequestEvm = ContractFunctionReturnType<
	typeof iSedaCore,
	AbiStateMutability,
	"getPendingRequests"
>[0];

export type DataResultEvm = ContractFunctionArgs<
	typeof iSedaCore,
	AbiStateMutability,
	"postResult"
>[0];

export function convertDataRequestEvmToDataRequest(
	input: DataRequestEvm,
	paybackAddress: Buffer,
): DataRequest {
	const result: DataRequest = {
		consensusFilter: Buffer.from(strip0x(input.request.consensusFilter), "hex"),
		execProgramId: strip0x(input.request.execProgramId),
		execInputs: Buffer.from(strip0x(input.request.execInputs), "hex"),
		memo: Buffer.from(strip0x(input.request.memo), "hex"),
		replicationFactor: input.request.replicationFactor,
		tallyProgramId: strip0x(input.request.tallyProgramId),
		tallyInputs: Buffer.from(strip0x(input.request.tallyInputs), "hex"),
		version: input.request.version,
		execGasLimit: input.request.execGasLimit,
		tallyGasLimit: input.request.tallyGasLimit,
		gasPrice: input.request.gasPrice,
		paybackAddress,
		fees: {
			batchFee: input.batchFee,
			requestFee: input.requestFee,
			resultFee: input.resultFee,
		},
	};

	return result;
}

export function convertDataResultToDataResultEvm(
	input: DataResult,
): DataResultEvm {
	const result: DataResultEvm = {
		blockHeight: BigInt(input.blockHeight),
		blockTimestamp: input.blockTimestamp,
		consensus: input.consensus,
		drId: add0x(input.drId),
		exitCode: input.exitCode,
		gasUsed: input.gasUsed,
		paybackAddress: add0x(input.paybackAddress.toString("hex")),
		result: add0x(input.result.toString("hex")),
		sedaPayload: add0x(input.sedaPayload.toString("hex")),
		version: input.version,
	};

	return result;
}
