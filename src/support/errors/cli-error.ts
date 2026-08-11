/**
 * An error with a trackable code prefix,
 * so users can search the docs for a specific failure instead of a generic message.
 */
export class CliError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(`(${code}) ${message}`);
        this.name = "CliError";
        this.code = code;
    }
}
