import { Result } from "true-myth";
import * as v from "valibot";

type SafeParseArguments = Parameters<typeof v.safeParse>;

export function tryParseSync<T extends v.GenericSchema<unknown, unknown>>(
	schema: T,
	input: SafeParseArguments[1],
	info?: SafeParseArguments[2],
): Result<v.InferOutput<T>, v.GenericIssue[]> {
	const result = v.safeParse(schema, input, info);

	if (result.success) {
		return Result.ok(result.output);
	}

	return Result.err(result.issues);
}
