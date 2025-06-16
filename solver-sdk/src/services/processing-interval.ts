/**
 * Waits for the callback to complete before allowing any new invocations in the same interval
 *
 * @param callback
 * @param interval
 * @returns
 */
export function processingInterval(
	callback: () => Promise<void>,
	interval?: number,
): Timer {
	let isProcessing = false;

	return setInterval(async () => {
		if (isProcessing) return;
		isProcessing = true;

		await callback();

		isProcessing = false;
	}, interval);
}
