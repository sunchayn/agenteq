import { parse as parseJsonc } from "jsonc-parser";
import type { ParseError } from "jsonc-parser";

/**
 * Parses JSON text, falling back to a lenient parse that tolerates comments and trailing commas when strict JSON.parse fails.
 * Reports whether that fallback was needed, since a config file read this way loses its comments once it gets rewritten.
 */
export function parseLenientJson(text: string): ParseLenientJsonResult {
    try {
        return { hadComments: false, value: JSON.parse(text) };
    } catch {
        return { hadComments: true, value: parseJsoncOrThrow(text) };
    }
}

/*
 * Interface & Types.
 */

export interface ParseLenientJsonResult {
    value: unknown;
    hadComments: boolean;
}

/*
 * Internal.
 */

function parseJsoncOrThrow(text: string): unknown {
    const errors: ParseError[] = [];

    const value: unknown = parseJsonc(text, errors, {
        allowTrailingComma: true,
    });

    if (errors.length > 0) {
        throw new SyntaxError(
            "Not valid JSON, even with comments and trailing commas allowed.",
        );
    }

    return value;
}
