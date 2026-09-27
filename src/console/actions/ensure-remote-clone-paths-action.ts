import input from "@infrastructure/terminal/input.js";
import loadAgentsFileAction from "@agents/actions/load-agents-file-action.js";
import saveRemoteClonePathAction from "@agents/actions/save-remote-clone-path-action.js";
import loadRemoteSourcesFileAction from "@artifacts/actions/load-remote-sources-file-action.js";
import { promptForClonePath } from "@console/actions/concerns/prompt-for-clone-path.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Makes sure every configured remote source has a clone location saved for this machine.
 * Each missing one is asked about once, or left to the default location when prompts are off.
 */
export default async function ensureRemoteClonePathsAction(
    options: EnsureRemoteClonePathsOptions,
): Promise<void> {
    const { context, shouldSkipPrompts } = options;

    const remotes = await loadRemoteSourcesFileAction({ context: context });
    const agentsFile = await loadAgentsFileAction({ context: context });

    const canInteract = input.isInteractive() && !shouldSkipPrompts;

    if (!canInteract) {
        return;
    }

    for (const name of remotes.names()) {
        if (agentsFile?.clonePathOf(name)) {
            continue;
        }

        const path = await promptForClonePath({
            canInteract: true,
            name: name,
        });

        await saveRemoteClonePathAction({
            context: context,
            name: name,
            path: path,
        });
    }
}

/*
 * Interface & Types.
 */

interface EnsureRemoteClonePathsOptions {
    context: RunContext;
    shouldSkipPrompts: boolean;
}
