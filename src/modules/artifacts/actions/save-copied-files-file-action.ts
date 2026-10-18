import { join } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import SyncManifestFile from "@artifacts/entities/sync-manifest-file.js";
import loadSyncManifestFileAction from "@artifacts/actions/load-sync-manifest-file-action.js";
import writeTrackedStateFileAction from "@shared/actions/write-tracked-state-file-action.js";
import type { AgentCapability } from "@artifacts/enums/agent-capability.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Removes every copied file recorded for this capability that this sync did not mirror again,
 * then saves the fresh set of paths it produced for that capability this run.
 * Every other capability's recorded paths are left exactly as they were, untouched by this call.
 */
export default async function saveCopiedFilesFileAction(
    options: SaveCopiedFilesFileOptions,
): Promise<void> {
    const { capability, context, copiedFilePaths, mirroredFilePaths } = options;

    const existing = await loadSyncManifestFileAction({ context: context });
    const previouslyCopiedPaths = existing.pathsFor(capability);

    // Nothing was ever copied for this capability and nothing is copied now, so skip.
    // A plain symlink sync then never creates or gitignores this file at all.
    if (previouslyCopiedPaths.length === 0 && copiedFilePaths.length === 0) {
        return;
    }

    const stalePaths = previouslyCopiedPaths.filter(
        (path) => !mirroredFilePaths.includes(path),
    );

    for (const stalePath of stalePaths) {
        await filesystem.remove(join(context.cwd, stalePath));
    }

    const updated = existing.withCapability(capability, copiedFilePaths);

    await writeTrackedStateFileAction({
        content: updated.serialize(),
        context: context,
        path: SyncManifestFile.path(context),
    });
}

/*
 * Interface & Types.
 */

interface SaveCopiedFilesFileOptions {
    context: RunContext;
    capability: AgentCapability;
    copiedFilePaths: string[];
    mirroredFilePaths: string[];
}
