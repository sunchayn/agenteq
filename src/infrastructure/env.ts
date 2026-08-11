/**
 * A standardized service to deal with env variables.
 */
export default {
    readFlag: readFlag,
    readString: readString,
};

/*
 * Internal.
 */

function readFlag(name: string): boolean {
    const value = process.env[name];

    return value === "1" || value?.toLowerCase() === "true";
}

function readString(name: string): string | undefined {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty string should also fall through to undefined, not just unset or null.
    return process.env[name] || undefined;
}
