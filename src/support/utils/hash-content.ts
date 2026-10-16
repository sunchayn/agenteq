import { createHash } from "node:crypto";

/**
 * Returns the sha256 hex digest of the given content.
 * Used to detect whether a file changed without comparing its full text.
 */
export function hashContent(content: string): string {
    return createHash("sha256").update(content).digest("hex");
}
