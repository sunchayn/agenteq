/**
 * A standardized service to deal with env variables.
 */
export default {
    readFlag: readFlag,
    readOptionalFlag: readOptionalFlag,
    readString: readString,
};

/*
 * Internal.
 */

function readFlag(name: string): boolean {
    const value = process.env[name];

    return value === "1" || value?.toLowerCase() === "true";
}

/**
 * Same parsing as readFlag, but returns undefined when the variable is unset,
 * so a caller can tell "not set" apart from "set to false".
 */
function readOptionalFlag(name: string): boolean | undefined {
    if (process.env[name] === undefined) {
        return undefined;
    }

    return readFlag(name);
}

function readString(name: string): string | undefined {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty string should also fall through to undefined, not just unset or null.
    return process.env[name] || undefined;
}
