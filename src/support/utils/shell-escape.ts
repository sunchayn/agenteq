/**
 * Escapes a value for safe interpolation into a shell command string.
 */
export function shellEscape(value: string): string {
    if (process.platform === "win32") {
        return `"${value.replace(/"/g, '""')}"`;
    }

    // Single quotes block all shell expansion, but a quote can't appear inside one.
    // So each quote in the value closes the string, adds an escaped quote, and reopens a new string.
    // For example, it's becomes 'it'\''s'.
    return `'${value.replace(/'/g, "'\\''")}'`;
}
