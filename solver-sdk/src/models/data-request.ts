import { Keccak256, keccak256 } from "@cosmjs/crypto";
import { BN } from "bn.js";

export interface DataRequest {
	version: string;
	execProgramId: string;
	execInputs: Buffer;
	tallyProgramId: string;
	tallyInputs: Buffer;
	replicationFactor: number;
	consensusFilter: Buffer;
	gasPrice: bigint;
	execGasLimit: bigint;
	tallyGasLimit: bigint;
	memo: Buffer;
	paybackAddress: Buffer;
	fees: {
		requestFee: bigint;
		resultFee: bigint;
		batchFee: bigint;
	};
}

export interface PostDataRequestArgs {
	version: string;
	exec_program_id: string;
	exec_inputs: string;
	tally_program_id: string;
	tally_inputs: string;
	replication_factor: number;
	consensus_filter: string;
	gas_price: string;
	exec_gas_limit: number;
	tally_gas_limit: number;
	memo: string;
}

export function createPostDataRequestArgs(
	dr: DataRequest,
): PostDataRequestArgs {
	return {
		exec_program_id: dr.execProgramId,
		replication_factor: dr.replicationFactor,
		tally_program_id: dr.tallyProgramId,
		version: dr.version,
		exec_gas_limit: Number(dr.execGasLimit),
		tally_gas_limit: Number(dr.tallyGasLimit),
		gas_price: dr.gasPrice.toString(),
		consensus_filter: dr.consensusFilter.toString("base64"),
		exec_inputs: dr.execInputs.toString("base64"),
		memo: dr.memo.toString("base64"),
		tally_inputs: dr.tallyInputs.toString("base64"),
	};
}

export function createDataRequestId(dr: DataRequest): string {
	// Hash non-fixed-length inputs
	const drInputsHash = keccak256(dr.execInputs);
	const tallyInputsHash = keccak256(dr.tallyInputs);
	const consensusFilterHash = keccak256(dr.consensusFilter);
	const memoHash = keccak256(dr.memo);
	const versionHash = keccak256(Buffer.from(dr.version));

	// 2 bytes for 16-bit
	const replicationFactor = new BN(dr.replicationFactor).toBuffer("be", 2);
	// 16 bytes for 128-bit
	const gasPrice = new BN(dr.gasPrice.toString()).toBuffer("be", 16);
	const execGasLimit = new BN(dr.execGasLimit.toString()).toBuffer("be", 8);
	const tallyGasLimit = new BN(dr.tallyGasLimit.toString()).toBuffer("be", 8);

	// Hash the data request
	const drHasher = new Keccak256();

	drHasher.update(versionHash);
	drHasher.update(Buffer.from(dr.execProgramId, "hex"));
	drHasher.update(drInputsHash);
	drHasher.update(execGasLimit);
	drHasher.update(Buffer.from(dr.tallyProgramId, "hex"));
	drHasher.update(tallyInputsHash);
	drHasher.update(tallyGasLimit);
	drHasher.update(replicationFactor);
	drHasher.update(consensusFilterHash);
	drHasher.update(gasPrice);
	drHasher.update(memoHash);

	return Buffer.from(drHasher.digest()).toString("hex");
}
