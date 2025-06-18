import type { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import type { EncodeObject } from "@cosmjs/proto-signing";
import type { DeliverTxResponse, StdFee } from "@cosmjs/stargate";
import { tryAsync } from "@seda-protocol/utils";
import { Result, ResultNS } from "true-myth";
import {
	DEFAULT_ADJUSTMENT_FACTOR,
	DEFAULT_GAS,
	DEFAULT_GAS_PRICE,
	type GasOptions,
} from "./gas-options";

export async function signAndSendTx(
	signingClient: SigningCosmWasmClient,
	address: string,
	messages: EncodeObject[],
	gasOptions: GasOptions = {},
	memo = "Sent from SEDA Solver",
): Promise<Result<DeliverTxResponse, unknown>> {
	const gasInput = gasOptions.gas ?? DEFAULT_GAS;

	let gas: bigint;
	if (gasInput === "auto") {
		const simulatedGas = await tryAsync(async () =>
			signingClient.simulate(address, messages, memo),
		);
		if (simulatedGas.isErr) {
			return Result.err(simulatedGas.error);
		}

		const adjustmentFactor =
			gasOptions.adjustmentFactor ?? DEFAULT_ADJUSTMENT_FACTOR;
		gas = BigInt(Math.round(simulatedGas.value * adjustmentFactor));
	} else {
		const manualGas = ResultNS.tryOrElse(
			(e) => e,
			() => BigInt(gasInput),
		);
		if (manualGas.isErr) {
			return Result.err(manualGas.error);
		}
		gas = manualGas.value;
	}

	const gasPrice = ResultNS.tryOrElse(
		(e) => e,
		() => BigInt(gasOptions.gasPrice ?? DEFAULT_GAS_PRICE),
	);
	if (gasPrice.isErr) {
		return Result.err(gasPrice.error);
	}

	const feeAmount = gas * gasPrice.value;
	const fee: StdFee = {
		gas: gas.toString(),
		amount: [{ denom: "aseda", amount: feeAmount.toString() }],
	};

	const txResult = await tryAsync(async () =>
		signingClient.signAndBroadcast(address, messages, fee, memo),
	);
	if (txResult.isErr) {
		return Result.err(txResult.error);
	}

	return Result.ok(txResult.value);
}
