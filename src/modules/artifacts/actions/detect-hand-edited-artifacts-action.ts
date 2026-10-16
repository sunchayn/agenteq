import { join } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import { hashContent } from "@support/utils/hash-content.js";
import loadSyncManifestFileAction from "@artifacts/actions/load-sync-manifest-file-action.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Compares every artifact path recorded in the last sync's manifest against its current content.
 * Returns the paths whose hash no longer matches, meaning they were edited by hand since that sync.
 * A path that no longer exists on disk is not reported, there is nothing left to overwrite there.
 */
export default async function detectHandEditedArtifactsAction(
    options: DetectHandEditedArtifactsOptions,
): Promise<string[]> {
    const { context } = options;

    const manifest = await loadSyncManifestFileAction({ context: context });

    const editedPaths: string[] = [];

    for (const [relPath, hash] of Object.entries(manifest.hashesByPath)) {
        const content = await readFileContent(join(context.cwd, relPath));

        if (content === undefined) {
            continue;
        }

        if (hashContent(content) !== hash) {
            editedPaths.push(relPath);
        }
    }

    return editedPaths;
}

/*
 * Interface & Types.
 */

interface DetectHandEditedArtifactsOptions {
    context: RunContext;
}

/*
 * Internal.
 */

/**
 * Reads a file's content, or undefined when the path does not exist or is not a regular file.
 */
async function readFileContent(path: string): Promise<string | undefined> {
    try {
        return await filesystem.readFile(path);
    } catch {
        return undefined;
    }
}
