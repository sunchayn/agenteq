import { join } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import { hashContent } from "@support/utils/hash-content.js";
import loadSyncManifestFileAction from "@artifacts/actions/load-sync-manifest-file-action.js";
import { GUIDELINES_BLOCK_PATTERN } from "@artifacts/services/artifacts-manager/stages/warm-up-boost-project-stage.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Compares every artifact path recorded in the last sync's manifest against its current content.
 * Returns the paths whose hash no longer matches, meaning they were edited by hand since that sync.
 * Skips a path that no longer exists on disk, or a guideline file still carrying Boost's block.
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

        if (GUIDELINES_BLOCK_PATTERN.test(content)) {
            // Boost rewrites this block on every install or update,
            // so a mismatch here is not something a person did by hand.
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
