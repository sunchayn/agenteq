import pc from "picocolors";
import filesystem from "@infrastructure/filesystem.js";
import git from "@infrastructure/git.js";
import { formatErrorDetails } from "@support/utils/format-error-details.js";
import loadRemoteSourcesFileAction from "@artifacts/actions/load-remote-sources-file-action.js";
import type { RemoteSourceEntry } from "@artifacts/entities/remote-sources-file.js";
import { SyncPayload } from "@artifacts/data-transfer-objects/sync-payload.js";
import type { ResolvedRemoteSource } from "@artifacts/data-transfer-objects/sync-payload.js";

/**
 * Resolves every configured remote source, in the order they were added.
 * A remote that fails to clone is dropped with a warning, not resolved at all this run.
 * A remote that fails to pull still resolves, against its last-synced state.
 */
export default async function resolveRemoteSourcesStage(
    payload: SyncPayload,
): Promise<SyncPayload> {
    const file = await loadRemoteSourcesFileAction({
        context: payload.context,
    });

    let result = payload;
    const resolved: ResolvedRemoteSource[] = [];

    for (const name of file.names()) {
        const entry = file.get(name);

        if (!entry) {
            continue;
        }

        const { outcome, warning } = await resolveOneRemote(name, entry);

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
): Promise<ResolveOneRemoteResult> {
    const { clonePath, selection, url } = entry;

    const hasExistingClone = await filesystem.exists(clonePath);

    const result = hasExistingClone
        ? await git.pull({ cwd: clonePath })
        : await git.clone({ targetDir: clonePath, url: url });

    if (!result.isSuccessful) {
        if (!hasExistingClone) {
            return {
                warning: `Could not clone the remote source "${pc.bold(name)}" at ${pc.bold(url)}, skipping it this run.${formatErrorDetails(result.detail)}`,
            };
        }

        return {
            outcome: {
                name: name,
                rootDir: clonePath,
                selection: selection,
                url: url,
            },
            warning: `Could not pull the remote source "${pc.bold(name)}" at ${pc.bold(clonePath)}, using its last-synced state.${formatErrorDetails(result.detail)}`,
        };
    }

    return {
        outcome: {
            name: name,
            rootDir: clonePath,
            selection: selection,
            url: url,
        },
    };
}
