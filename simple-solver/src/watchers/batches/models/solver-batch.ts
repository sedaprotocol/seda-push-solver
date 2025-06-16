import type { Batch } from "@seda-protocol/solver-sdk";

export enum SolverBatchState {
	Initial = 0,
	Posted = 1,
}

export class SolverBatch {
	private state: SolverBatchState = SolverBatchState.Initial;
	retryAmount = 0;

	constructor(public value: Batch) {}

	setState(newState: SolverBatchState) {
		this.state = newState;
		// Reset the state
		this.retryAmount = 0;
	}

	get currentState() {
		return this.state;
	}
}
