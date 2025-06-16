import type { Hex } from "../../../services/hex";

export interface EvmBatch {
	batchHeight: bigint;
	blockHeight: bigint;
	validatorsRoot: Hex;
	resultsRoot: Hex;
	provingMetadata: Hex;
}
