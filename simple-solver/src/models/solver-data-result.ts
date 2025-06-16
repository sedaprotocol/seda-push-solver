import type { DataResult } from "@seda-protocol/solver-sdk";

export enum SolverDataResultState {
	Initial = 0,
	Failed = 1,
}

export class SolverDataResult {
	private state: SolverDataResultState = SolverDataResultState.Initial;
	retryAmount = 0;

	constructor(public value: DataResult) {}

	setState(newState: SolverDataResultState) {
		this.state = newState;
		// Reset the state
		this.retryAmount = 0;
	}

	get currentState() {
		return this.state;
	}
}
