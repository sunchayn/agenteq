import loadAgentsFileAction from "@agents/actions/load-agents-file-action.js";
import resolveAgentsByNameAction from "@agents/actions/resolve-agents-by-name-action.js";
import type Agent from "@agents/entities/agent.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Reads the saved agents file and resolves its names into real Agent objects.
 * Returns undefined for a missing or malformed file, so the caller can fall through to detection.
 */
export default async function resolveSavedAgentsAction(
    options: ResolveSavedAgentsOptions,
): Promise<Agent[] | undefined> {
    const { context } = options;

    const saved = await loadAgentsFileAction({ context: context });

    if (!saved) {
        return undefined;
    }

    return resolveAgentsByNameAction(saved.agentNames);
}

/*
 * Interface & Types.
 */

interface ResolveSavedAgentsOptions {
    context: RunContext;
}
