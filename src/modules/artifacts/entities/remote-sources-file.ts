import { join } from "node:path";
import { z } from "zod";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Agenteq's own saved record of every named remote git source, keyed by the name given to it.
 * Each entry holds the url, the clone path, and the capabilities picked from it, saved at <source-dir>/remote-sources.json.
 */
export default class RemoteSourcesFile {
    private static readonly FILENAME = "remote-sources.json";

    readonly remotes: Record<string, RemoteSourceEntry>;

    constructor(remotes: Record<string, RemoteSourceEntry> = {}) {
        this.remotes = remotes;
    }

    static path(context: RunContext): string {
        return join(context.cwd, context.sourceDir, RemoteSourcesFile.FILENAME);
    }

    /**
     * Parses the saved file, or an empty one when the JSON is invalid or malformed.
     */
    static parse(raw: string): RemoteSourcesFile {
        let parsed: unknown;

        try {
            parsed = JSON.parse(raw);
        } catch {
            return new RemoteSourcesFile();
        }

        const result = remoteSourcesFileSchema.safeParse(parsed);

        return result.success
            ? new RemoteSourcesFile(result.data.remotes)
            : new RemoteSourcesFile();
    }

    /**
     * Names in insertion order, the same order the remotes were added in, matching `git remote`.
     */
    names(): string[] {
        return Object.keys(this.remotes);
    }

    get(name: string): RemoteSourceEntry | undefined {
        return this.remotes[name];
    }

    has(name: string): boolean {
        return name in this.remotes;
    }

    withRemote(name: string, entry: RemoteSourceEntry): RemoteSourcesFile {
        return new RemoteSourcesFile({ ...this.remotes, [name]: entry });
    }

    withoutRemote(name: string): RemoteSourcesFile {
        const rest = { ...this.remotes };

        Reflect.deleteProperty(rest, name);

        return new RemoteSourcesFile(rest);
    }

    isEmpty(): boolean {
        return this.names().length === 0;
    }

    serialize(): string {
        const body: SerializedRemoteSourcesFile = { remotes: this.remotes };

        return `${JSON.stringify(body, null, 2)}\n`;
    }
}

/*
 * Interface & types.
 */

export interface RemoteSourceEntry {
    url: string;
    clonePath: string;
    selection: RemoteSourceSelection;
}

export interface RemoteSourceSelection {
    skills: string[];
    commands: string[];
    mcp: string[];
    guidelines: boolean;
}

interface SerializedRemoteSourcesFile {
    remotes: Record<string, RemoteSourceEntry>;
}

const remoteSourceSelectionSchema = z.object({
    commands: z.array(z.string()),
    guidelines: z.boolean(),
    mcp: z.array(z.string()),
    skills: z.array(z.string()),
});

const remoteSourceEntrySchema = z.object({
    clonePath: z.string(),
    selection: remoteSourceSelectionSchema,
    url: z.string(),
});

const remoteSourcesFileSchema = z.object({
    remotes: z.record(z.string(), remoteSourceEntrySchema),
});
