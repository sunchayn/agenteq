import pc from "picocolors";
import filesystem from "@infrastructure/filesystem.js";
import git from "@infrastructure/git.js";
import { defaultClonePathFor } from "@support/utils/agenteq-sources-root.js";
import { formatErrorDetails } from "@support/utils/format-error-details.js";
import loadAgentsFileAction from "@agents/actions/load-agents-file-action.js";
import loadRemoteSourcesFileAction from "@artifacts/actions/load-remote-sources-file-action.js";
import type { RemoteSourceEntry } from "@artifacts/entities/remote-sources-file.js";
import { SyncPayload } from "@artifacts/data-transfer-objects/sync-payload.js";
import type { ResolvedRemoteSource } from "@artifacts/data-transfer-objects/sync-payload.js";

/**
 * Resolves every configured remote source, in the order they were added.
 * Each one is cloned at the path saved for this machine, or the default location when none was saved.
 * A remote that fails to clone is dropped with a warning, not resolved at all this run.
 * A remote that fails to pull still resolves, against its last-synced state.
 */
export default async function resolveRemoteSourcesStage(
    payload: SyncPayload,
): Promise<SyncPayload> {
    const file = await loadRemoteSourcesFileAction({
        context: payload.context,
    });

    const agentsFile = await loadAgentsFileAction({
        context: payload.context,
    });

    let result = payload;
    const resolved: ResolvedRemoteSource[] = [];

    for (const name of file.names()) {
        const entry = file.get(name);

        if (!entry) {
            continue;
        }

        const clonePath =
            agentsFile?.clonePathOf(name) ?? defaultClonePathFor(name);

        const { outcome, warning } = await resolveOneRemote(
            name,
            entry,
            clonePath,
        );

        if (warning) {
            result = result.withRemoteSourceWarning(warning);
        }

        if (outcome) {
            resolved.push(outcome);
        }
    }

    return result.withRemoteSources(resolved);
}

/*
 * Internal.
 */

interface ResolveOneRemoteResult {
    outcome?: ResolvedRemoteSource;
    warning?: string;
}

async function resolveOneRemote(
    name: string,
    entry: RemoteSourceEntry,
    clonePath: string,
): Promise<ResolveOneRemoteResult> {
    const { ref, selection, url } = entry;

    const hasExistingClone = await filesystem.exists(clonePath);

    if (!hasExistingClone) {
        const cloneResult = await git.clone({ targetDir: clonePath, url: url });

        if (!cloneResult.isSuccessful) {
            return {
                warning: `Could not clone the remote source "${pc.bold(name)}" at ${pc.bold(url)}, skipping it this run.${formatErrorDetails(cloneResult.detail)}`,
            };
        }
    }

    const outcome = {
        name: name,
        rootDir: clonePath,
        selection: selection,
        url: url,
    };

    if (ref) {
        return resolvePinnedRemote(name, clonePath, ref, outcome);
    }

    if (!hasExistingClone) {
        return { outcome: outcome };
    }

    const pullResult = await git.pull({ cwd: clonePath });

    if (!pullResult.isSuccessful) {
        return {
            outcome: outcome,
            warning: `Could not pull the remote source "${pc.bold(name)}" at ${pc.bold(clonePath)}, using its last-synced state.${formatErrorDetails(pullResult.detail)}`,
        };
    }

    return { outcome: outcome };
}

/**
 * Resolves a remote pinned to a git tag, warns out when newer tags are available.
 */
async function resolvePinnedRemote(
    name: string,
    clonePath: string,
    ref: string,
    outcome: ResolvedRemoteSource,
): Promise<ResolveOneRemoteResult> {
    const fetchResult = await git.fetchTags({ cwd: clonePath });

    if (!fetchResult.isSuccessful) {
        return {
            outcome: outcome,
            warning: `Could not fetch tags for the remote source "${pc.bold(name)}", using its last-synced state.${formatErrorDetails(fetchResult.detail)}`,
        };
    }

    const checkoutResult = await git.checkoutTag({ cwd: clonePath, tag: ref });

    if (!checkoutResult.isSuccessful) {
        return {
            outcome: outcome,
            warning: `Could not check out the pinned tag "${pc.bold(ref)}" for the remote source "${pc.bold(name)}", using its last-synced state.${formatErrorDetails(checkoutResult.detail)}`,
        };
    }

    const newest = git.listTags({ cwd: clonePath })[0];

    if (newest && newest !== ref) {
        return {
            outcome: outcome,
            warning: `Remote source "${pc.bold(name)}" is pinned to ${pc.bold(ref)}. A newer version ${pc.bold(newest)} is available. Run \`agenteq sync --update-pins\` to update.`,
        };
    }

    return { outcome: outcome };
}
