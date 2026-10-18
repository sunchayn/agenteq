import AgentsFile from "@agents/entities/agents-file.js";
import loadAgentsFileAction from "./load-agents-file-action.js";
import writeTrackedStateFileAction from "@shared/actions/write-tracked-state-file-action.js";
import type { AgentCapability } from "@artifacts/enums/agent-capability.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Writes agenteq's saved agents file to disk.
 */
export default async function saveAgentsFileAction(
    options: SaveAgentsFileOptions,
): Promise<void> {
    const { agentNames, capabilities, context, isCopyMode } = options;

    const existing = await loadAgentsFileAction({ context: context });

    await writeAgentsFile(
        context,
        (existing ?? AgentsFile.empty()).withAgents(
            agentNames,
            capabilities,
            isCopyMode,
        ),
    );
}

/**
 * Writes the file, and adds it to `.gitignore` the first time it is created.
 */
export async function writeAgentsFile(
    context: RunContext,
    updated: AgentsFile,
): Promise<void> {
    await writeTrackedStateFileAction({
        content: updated.serialize(),
        context: context,
        path: AgentsFile.path(context),
    });
}

/*
 * Interface & Types.
 */

interface SaveAgentsFileOptions {
    context: RunContext;
    agentNames: string[];
    capabilities: AgentCapability[];
    isCopyMode?: boolean;
}
