import { homedir } from "node:os";

/**
 * Expands a leading "~" and "$ENV"/"%ENV%" references against the current environment.
 * Matches both Unix ($VAR) and Windows (%VAR%) syntax regardless of host OS,
 * since agent definitions author paths for multiple platforms in one place.
 */
export function expandPath(path: string): string {
    if (path.startsWith("~")) {
        path = homedir() + path.slice(1);
    }

    return path.replace(
        /\$([A-Z_][A-Z0-9_]*)|%([A-Z_][A-Z0-9_]*)%/gi,
        (
            match: string,
            unixVar: string | undefined,
            winVar: string | undefined,
        ) => {
            const name = unixVar ?? winVar;

            return (name ? process.env[name] : undefined) ?? match;
        },
    );
}
