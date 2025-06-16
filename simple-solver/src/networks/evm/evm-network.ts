import { tryAsync } from "@seda-protocol/utils";
import { Maybe, Result, Unit } from "true-myth";
import { transposeArray } from "true-myth/maybe";
import {
	http,
	type Abi,
	type ContractFunctionArgs,
	ContractFunctionExecutionError,
	type ContractFunctionName,
	type PrivateKeyAccount,
	type PublicClient,
	type WalletClient,
	createPublicClient,
	createWalletClient,
	fallback,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { EvmNetworkConfig } from "../../config-parser";
import { NonceAlreadyUsedError } from "../../errors";
import logger from "../../logger";
import { add0x } from "../../services/hex";

// TODO: Since a network is bound to a chain id and a private key, we could prevent nonce errors by making sure only one call is allowed at the same time.
// (But it in sort of a waiting queue)
export class EvmNetwork {
	static type = "evm" as const;
	public readonly type = "evm" as const;
	private account: PrivateKeyAccount;
	public address: string;
	public walletClient: WalletClient;
	public publicClient: PublicClient;
	public feeClaimThreshold: bigint; // fee claim threshold in wei

	constructor(config: EvmNetworkConfig) {
		const rpcs: string[] = Array.isArray(config.rpc)
			? config.rpc
			: [config.rpc];

		const transport = fallback(rpcs.map((rpc) => http(rpc)));
		this.account = privateKeyToAccount(add0x(config.privateKey));
		this.address = this.account.address;
		this.feeClaimThreshold = config.feeClaimThreshold;

		logger.info(`Solver is using address ${this.account.address}`, {
			id: config.id,
		});

		this.walletClient = createWalletClient({
			account: this.account,
			transport,
		});

		this.publicClient = createPublicClient({
			transport,
		});
	}

	async view<
		const abi extends Abi | readonly unknown[],
		functionName extends ContractFunctionName<abi, "pure" | "view">,
		args extends ContractFunctionArgs<abi, "pure" | "view", functionName>,
	>(abi: abi, address: string, functionName: functionName, args: args) {
		const result = await tryAsync(async () =>
			this.publicClient.readContract({
				address: add0x(address),
				abi,
				functionName,
				args,
			}),
		);

		return result;
	}

	async call<
		const abi extends Abi | readonly unknown[],
		functionName extends ContractFunctionName<abi, "nonpayable" | "payable">,
		args extends ContractFunctionArgs<
			abi,
			"nonpayable" | "payable",
			functionName
		>,
	>(
		abi: abi,
		address: string,
		functionName: functionName,
		args: args,
		gasLimit?: bigint,
		gasPrice?: bigint,
	): Promise<
		Result<Unit, NonceAlreadyUsedError | ContractFunctionExecutionError | Error>
	> {
		const response = await transposeArray([
			Maybe.of(gasLimit),
			Maybe.of(gasPrice),
		]).match({
			Just: ([limit, price]) => {
				return tryAsync(async () =>
					this.walletClient.writeContract({
						abi,
						account: this.account,
						address: add0x(address),
						functionName,
						args,
						chain: null,
						gas: limit,
						gasPrice: price,
					}),
				);
			},
			Nothing: () => {
				return tryAsync(async () => {
					const simulation = await tryAsync(async () =>
						this.publicClient.simulateContract({
							account: this.account,
							address: add0x(address),
							abi: abi as Abi,
							functionName,
							args: args as unknown as unknown[],
						}),
					);

					if (simulation.isErr) {
						throw simulation.error;
					}

					return await this.walletClient.writeContract(
						simulation.value.request,
					);
				});
			},
		});

		if (response.isErr) {
			if (response.error instanceof ContractFunctionExecutionError) {
				if (
					response.error.shortMessage.includes(
						"replacement transaction underpriced",
					)
				) {
					return Result.err(new NonceAlreadyUsedError());
				}

				if (
					response.error.shortMessage.includes(
						"Nonce provided for the transaction is lower than",
					)
				) {
					return Result.err(new NonceAlreadyUsedError());
				}
			}

			return Result.err(response.error);
		}

		const receipt = await tryAsync(
			this.publicClient.waitForTransactionReceipt({
				hash: response.value,
			}),
		);

		return receipt.map(() => Unit);
	}
}
