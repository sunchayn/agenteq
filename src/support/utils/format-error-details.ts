import pc from "picocolors";

/**
 * Formats an underlying error detail.
 */
export function formatErrorDetails(detail: string | undefined): string {
    if (!detail) {
        return "";
    }

    return `\n\n${pc.bold("Error details:")}\n${detail}`;
}
