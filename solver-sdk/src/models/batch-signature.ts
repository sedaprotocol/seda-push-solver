import { ExtendedSecp256k1Signature } from "@cosmjs/crypto";

export class Secp256k1Signature {
	constructor(private signature: Buffer) {}

	/**
	 * Returns the raw signature bytes
	 * @returns {Buffer} The raw signature bytes
	 */
	getRawSignature(): Buffer {
		return this.signature;
	}

	/**
	 * Returns the signature formatted for Ethereum-like transactions
	 * Concatenates r, s and v (recovery id + 27) components
	 * @returns {Buffer} The Ethereum formatted signature
	 */
	getEthereumSignature(): Buffer {
		const extendedSignature = ExtendedSecp256k1Signature.fromFixedLength(
			this.signature,
		);
		// According to the Ethereum spec. (Legacy)
		const recoveryId = Buffer.from([extendedSignature.recovery + 27]);

		return Buffer.concat([
			// Specify length so we make sure that bytes are padded (some singatures start with 00)
			extendedSignature.r(32),
			extendedSignature.s(32),
			recoveryId,
		]);
	}
}
