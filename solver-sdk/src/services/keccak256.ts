import { keccak256 as cosmKeccak256 } from "@cosmjs/crypto";

/**
 * Computes the Keccak-256 hash of the input buffer.
 *
 * It takes a Buffer as input and returns the hash as a Buffer.
 *
 * @param {Buffer} buffer - The input data to be hashed.
 * @returns {Buffer} The Keccak-256 hash of the input, as a Buffer.
 *
 * @example
 * const inputBuffer = Buffer.from('Hello, world!');
 * const hashBuffer = keccak256(inputBuffer);
 * console.log(hashBuffer.toString('hex'));
 */

export function keccak256(buffer: Buffer) {
	return Buffer.from(cosmKeccak256(buffer));
}
