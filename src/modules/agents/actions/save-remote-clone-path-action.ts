import AgentsFile from "@agents/entities/agents-file.js";
import loadAgentsFileAction from "./load-agents-file-action.js";
import { writeAgentsFile } from "./save-agents-file-action.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Saves where this machine keeps a remote source's clone in Agenteq's manifest file.
 * Passing no `path` will make the local manifest forget it instead.
 */
export default async function saveRemoteClonePathAction(
    options: SaveRemoteClonePathOptions,
): Promise<void> {
    const { context, name, path } = options;

    const existing =
        (await loadAgentsFileAction({ context: context })) ??
        AgentsFile.empty();

    await writeAgentsFile(
        context,
        path
            ? existing.withRemoteClonePath(name, path)
            : existing.withoutRemoteClonePath(name),
    );
}

/*
 * Interface & Types.
 */

interface SaveRemoteClonePathOptions {
    context: RunContext;
    name: string;
    path?: string;
}
