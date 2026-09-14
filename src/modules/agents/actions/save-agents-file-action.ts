import { dirname, relative } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import git from "@infrastructure/git.js";
import AgentsFile from "@agents/entities/agents-file.js";
import loadAgentsFileAction from "./load-agents-file-action.js";
import type { AgentCapability } from "@artifacts/enums/agent-capability.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Writes agenteq's saved agents file to disk.
 */
export default async function saveAgentsFileAction(
    options: SaveAgentsFileOptions,
): Promise<void> {
    const { agentNames, capabilities, context } = options;

    const path = AgentsFile.path(context);

    const existedBefore = await filesystem.exists(path);
    const existing = await loadAgentsFileAction({ context: context });

    const updated = (existing ?? AgentsFile.empty()).withAgents(
        agentNames,
        capabilities,
    );

    await filesystem.mkdir(dirname(path));

    await filesystem.writeFile({
        content: updated.serialize(),
        path: path,
    });

    if (!existedBefore) {
        await git.ignore({
            cwd: context.cwd,
            relPath: relative(context.cwd, path),
        });
    }
}

/*
 * Interface & Types.
 */

interface SaveAgentsFileOptions {
    context: RunContext;
    agentNames: string[];
    capabilities: AgentCapability[];
}
