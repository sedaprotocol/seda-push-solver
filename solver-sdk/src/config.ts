export interface SolverConfig {
	/**
	 * RPC endpoint of the SEDA chain
	 */
	rpc: string;

	/**
	 * Mnemonic for posting data requests on the SEDA chain
	 */
	mnemonic: string;

	/**
	 * Minimum balance on SEDA Chain checked at startup
	 * Defaults to 1000 SEDA
	 */
	minimumBalance?: bigint;

	/**
	 * Core contract address on SEDA. (Defaults to 'auto')
	 */
	coreContractAddress?: string | "auto";

	/**
	 * How often (in ms) the solver should fetch the data results
	 * Defaults to every 5sec
	 */
	dataResultPollingIntervalMs?: number;

	/**
	 * How often (in ms) the solver should check for new batches on the SEDA chain
	 * Defaults to every 3sec
	 */
	batchPollingIntervalMs?: number;

	/**
	 * The batch number to start fetching from. The solver will get all batches from this point up to the latest batch.
	 * If not provided, starts from the latest batch.
	 */
	startingBatch?: bigint | "latest";
}

export type SolverConfigInternal = Required<SolverConfig>;

export function createConfig(input: SolverConfig): SolverConfigInternal {
	return {
		...input,
		coreContractAddress: input.coreContractAddress ?? "auto",
		minimumBalance: input.minimumBalance ?? 1_000_000_000_000_000_000_000n,
		dataResultPollingIntervalMs: input.dataResultPollingIntervalMs ?? 5_000,
		batchPollingIntervalMs: input.batchPollingIntervalMs ?? 3_000,
		startingBatch: input.startingBatch ?? "latest",
	};
}
