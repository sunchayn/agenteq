import pc from "picocolors";
import filesystem from "@infrastructure/filesystem.js";
import git from "@infrastructure/git.js";
import { defaultClonePathFor } from "@support/utils/agenteq-sources-root.js";
import { formatErrorDetails } from "@support/utils/format-error-details.js";
import loadAgentsFileAction from "@agents/actions/load-agents-file-action.js";
import loadRemoteSourcesFileAction from "@artifacts/actions/load-remote-sources-file-action.js";
import saveRemoteSourcesFileAction from "@artifacts/actions/save-remote-sources-file-action.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Re-pins every remote source currently pinned to a tag, to its newest available tag.
 * A remote with no pin is left tracking its default branch, untouched.
 * Returns one warning per remote whose tags could not be fetched, left pinned as it was.
 */
export default async function updateRemoteSourcePinsAction(
    options: UpdateRemoteSourcePinsOptions,
): Promise<string[]> {
    const { context } = options;

    const file = await loadRemoteSourcesFileAction({ context: context });
    const agentsFile = await loadAgentsFileAction({ context: context });

    const warnings: string[] = [];
    let remotes = file.remotes;

    for (const name of file.names()) {
        const entry = file.get(name);

        if (!entry?.ref) {
            continue;
        }

        const clonePath =
            agentsFile?.clonePathOf(name) ?? defaultClonePathFor(name);

        if (!(await filesystem.exists(clonePath))) {
            // Nothing cloned yet, the next sync clones it fresh and checks the pinned ref out directly.
            continue;
        }

        const fetchResult = await git.fetchTags({ cwd: clonePath });

        if (!fetchResult.isSuccessful) {
            warnings.push(
                `Could not fetch tags for the remote source "${pc.bold(name)}", its pin was left unchanged.${formatErrorDetails(fetchResult.detail)}`,
            );

            continue;
        }

        const newest = git.listTags({ cwd: clonePath })[0];

        if (!newest || newest === entry.ref) {
            continue;
        }

        remotes = { ...remotes, [name]: { ...entry, ref: newest } };
    }

    if (remotes !== file.remotes) {
        await saveRemoteSourcesFileAction({
            context: context,
            remotes: remotes,
            shouldIgnore: false,
        });
    }

    return warnings;
}

/*
 * Interface & Types.
 */

interface UpdateRemoteSourcePinsOptions {
    context: RunContext;
}
