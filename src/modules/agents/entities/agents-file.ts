import { join } from "node:path";
import { z } from "zod";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Agenteq's own saved file listing which agents and capabilities a project uses.
 * It also holds where this machine keeps each remote source's clone.
 * The file is saved at <source-dir>/agenteq.json.
 */
export default class AgentsFile {
    private static readonly FILENAME = "agenteq.json";

    readonly agentNames: string[];

    readonly capabilities: string[] | undefined;

    readonly remoteClonePaths: Record<string, string>;

    private constructor(
        agentNames: string[],
        capabilities: string[] | undefined,
        remoteClonePaths: Record<string, string> = {},
    ) {
        this.agentNames = agentNames;
        this.capabilities = capabilities;
        this.remoteClonePaths = remoteClonePaths;
    }

    static of(
        agentNames: string[],
        capabilities: string[] | undefined,
    ): AgentsFile {
        return new AgentsFile(agentNames, capabilities);
    }

    static empty(): AgentsFile {
        return new AgentsFile([], undefined);
    }

    static path(context: RunContext): string {
        return join(context.cwd, context.sourceDir, AgentsFile.FILENAME);
    }

    /**
     * Parses the saved file, or null when `agents` itself is invalid or malformed.
     */
    static parse(raw: string): AgentsFile | null {
        let parsed: unknown;

        try {
            parsed = JSON.parse(raw);
        } catch {
            return null;
        }

        const result = agentsFileSchema.safeParse(parsed);

        if (!result.success) {
            return null;
        }

        return new AgentsFile(
            result.data.agents,
            result.data.capabilities,
            result.data.remoteClonePaths,
        );
    }

    /**
     * Returns a new file with the agent selection replaced, everything else kept as-is.
     */
    withAgents(
        agentNames: string[],
        capabilities: string[] | undefined,
    ): AgentsFile {
        return new AgentsFile(agentNames, capabilities, this.remoteClonePaths);
    }

    /**
     * Returns the path where this machine keeps the clone of a remote source, if one was saved.
     */
    clonePathOf(name: string): string | undefined {
        return this.remoteClonePaths[name];
    }

    /**
     * True for a file written only to remember clone paths, before `init` saved any selection.
     */
    isCreatedByRemoteClonePathOnly(): boolean {
        return this.agentNames.length === 0 && this.capabilities === undefined;
    }

    withRemoteClonePath(name: string, path: string): AgentsFile {
        return new AgentsFile(this.agentNames, this.capabilities, {
            ...this.remoteClonePaths,
            [name]: path,
        });
    }

    withoutRemoteClonePath(remoteNameToDrop: string): AgentsFile {
        const remoteClonePaths = { ...this.remoteClonePaths };

        Reflect.deleteProperty(remoteClonePaths, remoteNameToDrop);

        return new AgentsFile(
            this.agentNames,
            this.capabilities,
            remoteClonePaths,
        );
    }

    serialize(): string {
        const body: {
            agents: string[];
            capabilities?: string[];
            remoteClonePaths?: Record<string, string>;
        } = {
            agents: this.agentNames,
        };

        if (this.capabilities) {
            body.capabilities = this.capabilities;
        }

        if (Object.keys(this.remoteClonePaths).length > 0) {
            body.remoteClonePaths = this.remoteClonePaths;
        }

        return `${JSON.stringify(body, null, 2)}\n`;
    }
}

/*
 * Interface & types.
 */

const agentsFileSchema = z.object({
    agents: z.array(z.string()),
    capabilities: z.array(z.string()).optional(),
    remoteClonePaths: z.record(z.string(), z.string()).default({}),
});
