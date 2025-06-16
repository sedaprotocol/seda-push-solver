import IProver from "@seda-protocol/evm/artifacts/contracts/interfaces/IProver.sol/IProver.json";
import ISedaCore from "@seda-protocol/evm/artifacts/contracts/interfaces/ISedaCore.sol/ISedaCore.json";

import ISedaCoreV1 from "@seda-protocol/evm/artifacts/contracts/core/SedaCoreV1.sol/SedaCoreV1.json";
import ISecp256k1ProverV1 from "@seda-protocol/evm/artifacts/contracts/provers/Secp256k1ProverV1.sol/Secp256k1ProverV1.json";

import ISedaFeeManager from "@seda-protocol/evm/artifacts/contracts/fees/SedaFeeManager.sol/SedaFeeManager.json";

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

writeFile(
	resolve(import.meta.dir, "./src/i-seda-core.abi.ts"),
	`export const iSedaCore = ${JSON.stringify(ISedaCore.abi, null, "\t")} as const;`,
);

writeFile(
	resolve(import.meta.dir, "./src/i-prover.abi.ts"),
	`export const iProver = ${JSON.stringify(IProver.abi, null, "\t")} as const;`,
);

writeFile(
	resolve(import.meta.dir, "./src/abi-secp256k1-prover-v1.abi.ts"),
	`export const abiSecp256k1ProverV1 = ${JSON.stringify(ISecp256k1ProverV1.abi, null, "\t")} as const;`,
);

writeFile(
	resolve(import.meta.dir, "./src/abi-seda-core-v1.abi.ts"),
	`export const abiSedaCoreV1 = ${JSON.stringify(ISedaCoreV1.abi, null, "\t")} as const;`,
);

writeFile(
	resolve(import.meta.dir, "./src/abi-seda-fee-manager.abi.ts"),
	`export const abiSedaFeeManager = ${JSON.stringify(ISedaFeeManager.abi, null, "\t")} as const;`,
);
