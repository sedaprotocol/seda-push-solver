import { describe, expect, it } from "bun:test";
import { type DataRequest, createDataRequestId } from "./data-request";

describe("createDataRequestId", () => {
	it("should create a valid data request hash", () => {
		const expectedHash =
			"44982d4ddbc0a42dadb80714eba3035fe3250c258af4de235a36758ca34f32e8";

		const dataRequest: DataRequest = {
			consensusFilter: Buffer.from("00", "hex"),
			execProgramId:
				"044852b2a670ade5407e78fb2863c51de9fcb96542a07186fe3aeda6bb8a116d",
			execInputs: Buffer.from("64725f696e70757473", "hex"),
			execGasLimit: 10n,
			tallyGasLimit: 11n,
			gasPrice: 10n,
			memo: Buffer.from(
				"5d3b53aa92e0bf21abe78ffea2ff372721bce76969ed5ab306b0b5d14a6c2238",
				"hex",
			),
			replicationFactor: 1,
			paybackAddress: Buffer.from([]),
			tallyProgramId:
				"3a1561a3d854e446801b339c137f87dbd2238f481449c00d3470cfcc2a4e24a1",
			tallyInputs: Buffer.from("74616c6c795f696e70757473", "hex"),
			version: "0.0.1",
			fees: {
				batchFee: 0n,
				requestFee: 0n,
				resultFee: 0n,
			},
		};

		const generatedId = createDataRequestId(dataRequest);

		expect(generatedId).toBe(expectedHash);
	});

	it("should create a valid data request hash when all parameters are different", () => {
		const expectedHash =
			"22685781d4e082c09f4d6c1055320c80b41385870b880bf6f0a2b3150df7bb0a";

		const dataRequest: DataRequest = {
			consensusFilter: Buffer.from("00", "hex"),
			execProgramId:
				"044852b2a670ade5407e78fb2863c51de9fcb96542a07186fe3aeda6bb8a116d",
			execInputs: Buffer.from("64725f696e70757473", "hex"),
			execGasLimit: 10n,
			tallyGasLimit: 11n,
			gasPrice: 11n,
			memo: Buffer.from(
				"5d3b53aa92e0bf21abe78ffea2ff372721bce76969ed5ab306b0b5d14a6c2238",
				"hex",
			),
			replicationFactor: 1,
			paybackAddress: Buffer.from([]),
			tallyProgramId:
				"3a1561a3d854e446801b339c137f87dbd2238f481449c00d3470cfcc2a4e24a1",
			tallyInputs: Buffer.from("74616c6c795f696e70757473", "hex"),
			version: "0.0.1",
			fees: {
				batchFee: 0n,
				requestFee: 0n,
				resultFee: 0n,
			},
		};

		const generatedId = createDataRequestId(dataRequest);

		expect(generatedId).toBe(expectedHash);
	});
});
