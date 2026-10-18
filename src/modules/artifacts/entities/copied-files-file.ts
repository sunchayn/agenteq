import { join } from "node:path";
import { z } from "zod";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Agenteq's own saved record of every artifact path it wrote as a real file copy instead of a symlink.
 * Entries are grouped by capability, so each capability can be reconciled independently.
 */
export default class CopiedFilesFile {
    private static readonly FILENAME = "agenteq-copied-files.json";

    readonly pathsByCapability: Record<string, string[]>;

    constructor(pathsByCapability: Record<string, string[]> = {}) {
        this.pathsByCapability = pathsByCapability;
    }

    static path(context: RunContext): string {
        return join(context.cwd, context.sourceDir, CopiedFilesFile.FILENAME);
    }

    /**
     * Parses the saved file, or an empty one when the JSON is invalid or malformed.
     */
    static parse(raw: string): CopiedFilesFile {
        let parsed: unknown;

        try {
            parsed = JSON.parse(raw);
        } catch {
            return new CopiedFilesFile();
        }

        const result = copiedFilesFileSchema.safeParse(parsed);

        return result.success
            ? new CopiedFilesFile(result.data.pathsByCapability)
            : new CopiedFilesFile();
    }

    /**
     * The paths recorded for one capability, or an empty array when none were recorded yet.
     */
    pathsFor(capability: string): string[] {
        return this.pathsByCapability[capability] ?? [];
    }

    /**
     * Returns a new file with one capability's paths replaced, every other capability's untouched.
     * A capability never requested in a given sync run keeps whatever it last had.
     */
    withCapability(capability: string, paths: string[]): CopiedFilesFile {
        return new CopiedFilesFile({
            ...this.pathsByCapability,
            [capability]: paths,
        });
    }

    serialize(): string {
        const body: SerializedCopiedFilesFile = {
            pathsByCapability: this.pathsByCapability,
        };

        return `${JSON.stringify(body, null, 2)}\n`;
    }
}

/*
 * Interface & types.
 */

interface SerializedCopiedFilesFile {
    pathsByCapability: Record<string, string[]>;
}

const copiedFilesFileSchema = z.object({
    pathsByCapability: z.record(z.string(), z.array(z.string())),
});
