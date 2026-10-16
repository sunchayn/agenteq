import filesystem from "@infrastructure/filesystem.js";
import SyncManifestFile from "@artifacts/entities/sync-manifest-file.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Reads and parses Agenteq's saved sync manifest, an empty one when nothing was saved yet.
 */
export default async function loadSyncManifestFileAction(
    options: LoadSyncManifestFileOptions,
): Promise<SyncManifestFile> {
    const { context } = options;

    const raw = await filesystem.readFile(SyncManifestFile.path(context));

    return raw ? SyncManifestFile.parse(raw) : new SyncManifestFile();
}

/*
 * Interface & Types.
 */

interface LoadSyncManifestFileOptions {
    context: RunContext;
}
