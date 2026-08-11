import { join } from "node:path";
import { z } from "zod";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * agenteq's own saved file listing which agents and capabilities a project uses.
 * The file is saved at <source-dir>/agenteq.json.
 */
export default class AgentsFile {
    private static readonly FILENAME = "agenteq.json";

    readonly agentNames: string[];

    readonly capabilities: string[] | undefined;

    private constructor(
        agentNames: string[],
        capabilities: string[] | undefined,
    ) {
        this.agentNames = agentNames;
        this.capabilities = capabilities;
    }

    static of(
        agentNames: string[],
        capabilities: string[] | undefined,
    ): AgentsFile {
        return new AgentsFile(agentNames, capabilities);
    }

    static path(context: RunContext): string {
        return join(context.cwd, context.sourceDir, AgentsFile.FILENAME);
    }

    /**
     * Parses the saved file, or null when the JSON is invalid or malformed.
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

        return new AgentsFile(result.data.agents, result.data.capabilities);
    }

    serialize(): string {
        const body: { agents: string[]; capabilities?: string[] } = {
            agents: this.agentNames,
        };

        if (this.capabilities) {
            body.capabilities = this.capabilities;
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
});
