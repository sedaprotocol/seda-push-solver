import { ExtendedSecp256k1Signature, Secp256k1 } from "@cosmjs/crypto";
import { keccak256 } from "./keccak256";

export function recoverSecp256k1PublicKey(
	signature: Uint8Array,
	message: Buffer,
): Buffer {
	const extended = ExtendedSecp256k1Signature.fromFixedLength(signature);
	return Buffer.from(Secp256k1.recoverPubkey(extended, message));
}

export function createEthAddress(publicKey: Buffer): Buffer {
	const pubKeyNoPrefix =
		publicKey.length === 65 ? publicKey.subarray(1) : publicKey;
	const ethAddress = Buffer.from(keccak256(pubKeyNoPrefix).subarray(-20));

	return ethAddress;
}
