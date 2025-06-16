import type { Maybe, Result } from "true-myth";

/**
 * Utility function to unwrap the value from a Maybe or Result type.
 *
 * This function is useful in scenarios where you are certain that the value exists.
 * It will throw an error if the value cannot be unwrapped (i.e., if Maybe is Nothing or Result is Err).
 *
 * @param input - A Maybe<T> or Result<T, E> to unwrap
 * @param message - Optional error message or Error instance to throw if unwrap fails
 * @returns The unwrapped value of type T
 * @throws Error if the input cannot be unwrapped
 */
export function unwrap<T, E = unknown>(
	input: Maybe<T> | Result<T, E>,
	message?: string | Error,
): T {
	return input.unwrapOrElse((error?: unknown) => {
		if (message) {
			if (message instanceof Error) {
				throw message;
			}

			throw new Error(message);
		}

		if (error instanceof Error) {
			throw error;
		}

		throw new Error(`Called unwrap on a ${input.variant}`);
	});
}
