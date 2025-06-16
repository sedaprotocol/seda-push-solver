import { EventEmitter } from "node:events";
import type {
	JsonObject,
	SigningCosmWasmClient,
} from "@cosmjs/cosmwasm-stargate";
import type { EncodeObject } from "@cosmjs/proto-signing";
import type { ProtobufRpcClient } from "@cosmjs/stargate";
import { StargateClient } from "@cosmjs/stargate";
import { tryAsync } from "@seda-protocol/utils";
import { Maybe, Result } from "true-myth";
import type { SolverConfigInternal } from "../../config";
import { processingInterval } from "../../services/processing-interval";
import { createProtoQueryClient } from "./query-client";
import { signAndSendTx } from "./sign-and-send-tx";
import { type ISigner, Signer } from "./signer";
import { createSigningClient } from "./signing-client";

const MAX_MESSAGES_PER_TRANSACTION = 5;
const TIME_BETWEEN_PROCESSING_QUEUE = 5_000;
const QUEUE_INTERVAL = 1_000;

type EventMap = {
	"tx-error": [string, TransactionMessage | undefined];
	"tx-success": [TransactionMessage];
};

export interface TransactionMessage {
	id: string;
	message: EncodeObject;
	type: string;
}

export class SedaChain extends EventEmitter<EventMap> {
	private transactionQueue: TransactionMessage[] = [];
	private intervalId?: Timer;

	private constructor(
		public signer: ISigner,
		private signerClient: SigningCosmWasmClient,
		private protoClient: ProtobufRpcClient,
		private stargateClient: StargateClient,
	) {
		super();
	}

	getProtobufRpcClient(): ProtobufRpcClient {
		return this.protoClient;
	}

	getSignerAddress() {
		return this.signer.getAddress();
	}

	getCoreContractAddress() {
		return this.signer.getCoreContractAddress();
	}

	queueMessages(messages: TransactionMessage[]) {
		for (const message of messages) {
			this.transactionQueue.push(message);
		}
	}

	async queryContractSmart<T = unknown>(
		queryMsg: JsonObject,
	): Promise<Result<T, Error>> {
		return tryAsync<T>(() =>
			this.signerClient.queryContractSmart(
				this.getCoreContractAddress(),
				queryMsg,
			),
		);
	}

	/**
	 * Checks if the signer has sufficient balance on SEDA Chain.
	 * @param minimumBalance - The minimum balance required
	 * @returns Result containing the balance if sufficient, or an error if insufficient
	 */
	async checkSignerBalance(minimumBalance: bigint) {
		const response = await tryAsync(() =>
			this.stargateClient.getBalance(this.signer.getAddress(), "aseda"),
		);

		if (response.isErr) {
			return Result.err(response.error);
		}

		const balance = BigInt(response.value.amount);
		if (balance > minimumBalance) {
			return Result.ok(response.value);
		}
		return Result.err(
			new Error(
				`Signer has insufficient balance: Want ${minimumBalance}aseda, got ${balance}aseda`,
			),
		);
	}

	async processQueue() {
		const txMessages = this.transactionQueue.splice(
			0,
			MAX_MESSAGES_PER_TRANSACTION,
		);

		// No need to send empty transactions
		if (txMessages.length === 0) {
			return;
		}

		const cosmosMessages = txMessages.map((msg) => msg.message);
		const result = await signAndSendTx(
			this.signerClient,
			this.signer.getAddress(),
			cosmosMessages,
		);

		if (result.isErr) {
			const error =
				result.error instanceof Error
					? result.error.message
					: `${result.error}`;

			const messageIndexRegex = new RegExp(/message index: (\d+)/gm);
			const capturedGroup = Maybe.of(messageIndexRegex.exec(error));

			if (capturedGroup.isNothing) {
				this.emit("tx-error", error, undefined);
				return;
			}

			const messageIndex = Number(capturedGroup.value[1]);
			this.emit("tx-error", error, txMessages[messageIndex]);

			// Remove the failing transaction message
			txMessages.splice(messageIndex);

			// Re-queue the messages which didn't throw
			this.queueMessages(txMessages);
			return;
		}

		for (const txMessage of txMessages) {
			this.emit("tx-success", txMessage);
		}
	}

	start() {
		clearInterval(this.intervalId);
		let lastInterval = Date.now();

		this.intervalId = processingInterval(async () => {
			const now = Date.now();
			const timeBetweenLastInterval = now - lastInterval;

			// Either process the queue when we have too many messages in the queue or
			// we haven't processed the queue in a while
			if (
				this.transactionQueue.length >= MAX_MESSAGES_PER_TRANSACTION ||
				timeBetweenLastInterval >= TIME_BETWEEN_PROCESSING_QUEUE
			) {
				lastInterval = now;
				await this.processQueue();
			}
		}, QUEUE_INTERVAL);
	}

	static async fromConfig(
		config: SolverConfigInternal,
	): Promise<Result<SedaChain, unknown>> {
		const signer = await Signer.fromConfig(config);
		const signingClient = await createSigningClient(signer);
		const protoClient = await createProtoQueryClient(config.rpc);
		const stargateClient = await StargateClient.connect(config.rpc);

		if (signingClient.isErr) {
			return Result.err(signingClient.error);
		}

		return Result.ok(
			new SedaChain(
				signer,
				signingClient.value.client,
				protoClient,
				stargateClient,
			),
		);
	}
}
