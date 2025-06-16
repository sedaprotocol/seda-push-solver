export type Hex = `0x${string}`;

export function add0x(input: string): Hex {
	if (input.startsWith("0x")) return input as Hex;
	return `0x${input}`;
}

export function strip0x(input: string): string {
	if (input.startsWith("0x")) return input.slice(2);
	return input;
}
