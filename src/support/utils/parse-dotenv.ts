/**
 * Parses a dotenv-style KEY=VALUE text into a flat map.
 * Blank lines, comment lines, and lines with no "=" are skipped.
 * A value may be wrapped in single or double quotes, stripped here.
 */
export function parseDotenv(text: string): Record<string, string> {
    const values: Record<string, string> = {};

    for (const line of text.split("\n")) {
        const trimmed = line.trim();

        if (trimmed === "" || trimmed.startsWith("#")) {
            continue;
        }

        const separatorIndex = trimmed.indexOf("=");

        if (separatorIndex === -1) {
            continue;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        const rawValue = trimmed.slice(separatorIndex + 1).trim();

        values[key] = unquote(rawValue);
    }

    return values;
}

/*
 * Internal.
 */

function unquote(value: string): string {
    const isQuoted =
        value.length >= 2 &&
        (value.startsWith('"') || value.startsWith("'")) &&
        value.endsWith(value[0]);

    return isQuoted ? value.slice(1, -1) : value;
}
