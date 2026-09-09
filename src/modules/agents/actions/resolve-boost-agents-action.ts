import { join } from "node:path";
import { z } from "zod";
import filesystem from "@infrastructure/filesystem.js";
import type { RunContext } from "@shared/types/run-context.js";
import { agentDefinitions } from "@agents/registry.js";
import type Agent from "@agents/entities/agent.js";

/**
 * Reads Laravel Boost's own `boost.json` and resolves the agent names it lists.
 */
export default async function resolveBoostAgentsAction(
    options: ResolveBoostAgentsOptions,
): Promise<Agent[] | undefined> {
    const { context } = options;

    const fileContent =
        options.fileContent ??
        (await filesystem.readFile(join(context.cwd, "boost.json")));

    if (!fileContent) {
        return undefined;
    }

    let parsed: unknown;

    try {
        parsed = JSON.parse(fileContent);
    } catch {
        return undefined;
    }

    const result = boostConfigSchema.safeParse(parsed);

    if (!result.success) {
        return undefined;
    }

    const agents = agentDefinitions.filter((agent) =>
        result.data.agents.includes(agent.name),
    );

    return agents.length > 0 ? agents : undefined;
}

/*
 * Interface & Types.
 */

interface ResolveBoostAgentsOptions {
    context: RunContext;
    fileContent?: string;
}

/*
 * Internal.
 */

const boostConfigSchema = z.object({
    agents: z.array(z.string()).default([]),
});
