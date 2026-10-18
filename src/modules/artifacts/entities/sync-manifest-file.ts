import { join } from "node:path";
import { z } from "zod";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Agenteq's own saved record of the last sync, saved at <source-dir>/agenteq/sync-manifest.json.
 * Holds the necessary sync traces, such as content hashes, needed for some features to function.
 */
export default class SyncManifestFile {
    private static readonly FILENAME = "agenteq/sync-manifest.json";

    readonly hashesByPath: Record<string, string>;
    readonly pathsByCapability: Record<string, string[]>;

    constructor(
        hashesByPath: Record<string, string> = {},
        pathsByCapability: Record<string, string[]> = {},
    ) {
        this.hashesByPath = hashesByPath;
        this.pathsByCapability = pathsByCapability;
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
            ? new SyncManifestFile(result.data.artifacts, result.data.pathsByCapability)
            : new SyncManifestFile();
    }

    hashFor(relPath: string): string | undefined {
        return this.hashesByPath[relPath];
    }

    /**
     * The paths recorded for one capability, or an empty array when none were recorded yet.
     */
    pathsFor(capability: string): string[] {
        return this.pathsByCapability[capability] ?? [];
    }

    /**
     * Returns a new file with the hashes replaced, capability paths untouched.
     */
    withHashes(hashesByPath: Record<string, string>): SyncManifestFile {
        return new SyncManifestFile(hashesByPath, this.pathsByCapability);
    }

    /**
     * Returns a new file with one capability's paths replaced, every other capability untouched.
     * A capability never requested in a given sync run keeps whatever it last had.
     */
    withCapability(capability: string, paths: string[]): SyncManifestFile {
        return new SyncManifestFile(this.hashesByPath, {
            ...this.pathsByCapability,
            [capability]: paths,
        });
    }

    serialize(): string {
        const body: SerializedSyncManifestFile = {
            artifacts: this.hashesByPath,
            pathsByCapability: this.pathsByCapability,
        };

        return `${JSON.stringify(body, null, 2)}\n`;
    }
}

/*
 * Interface & types.
 */

interface SerializedSyncManifestFile {
    artifacts: Record<string, string>;
    pathsByCapability: Record<string, string[]>;
}

const syncManifestFileSchema = z.object({
    artifacts: z.record(z.string(), z.string()).default({}),
    pathsByCapability: z.record(z.string(), z.array(z.string())).default({}),
});
