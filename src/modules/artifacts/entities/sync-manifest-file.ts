import { join } from "node:path";
import { z } from "zod";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Agenteq's own saved record of the content hash of every artifact written during the last sync.
 * Keyed by that artifact's path relative to the project root, saved at <source-dir>/agenteq-sync-manifest.json.
 */
export default class SyncManifestFile {
    private static readonly FILENAME = "agenteq-sync-manifest.json";

    readonly hashesByPath: Record<string, string>;

    constructor(hashesByPath: Record<string, string> = {}) {
        this.hashesByPath = hashesByPath;
    }

    static path(context: RunContext): string {
        return join(context.cwd, context.sourceDir, SyncManifestFile.FILENAME);
    }

    /**
     * Parses the saved file, or an empty one when the JSON is invalid or malformed.
     */
    static parse(raw: string): SyncManifestFile {
        let parsed: unknown;

        try {
            parsed = JSON.parse(raw);
        } catch {
            return new SyncManifestFile();
        }

        const result = syncManifestFileSchema.safeParse(parsed);

        return result.success
            ? new SyncManifestFile(result.data.artifacts)
            : new SyncManifestFile();
    }

    hashFor(relPath: string): string | undefined {
        return this.hashesByPath[relPath];
    }

    serialize(): string {
        const body: SerializedSyncManifestFile = {
            artifacts: this.hashesByPath,
        };

        return `${JSON.stringify(body, null, 2)}\n`;
    }
}

/*
 * Interface & types.
 */

interface SerializedSyncManifestFile {
    artifacts: Record<string, string>;
}

const syncManifestFileSchema = z.object({
    artifacts: z.record(z.string(), z.string()),
});
