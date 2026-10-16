import { dirname, join, relative } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import git from "@infrastructure/git.js";
import { hashContent } from "@support/utils/hash-content.js";
import SyncManifestFile from "@artifacts/entities/sync-manifest-file.js";
import loadSyncManifestFileAction from "@artifacts/actions/load-sync-manifest-file-action.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Hashes every artifact path just synced and merges the result into Agenteq's saved sync manifest,
 * keeping every hash already saved for a path this run did not touch.
 * A path that resolves to a directory is skipped, since it's not a single hashable file.
 */
export default async function saveSyncManifestFileAction(
    options: SaveSyncManifestFileOptions,
): Promise<void> {
    const { artifactPaths, context } = options;

    const existing = await loadSyncManifestFileAction({ context: context });
    const hashesByPath = { ...existing.hashesByPath };

    for (const relPath of artifactPaths) {
        const content = await readFileContent(join(context.cwd, relPath));

        if (content === undefined) {
            continue;
        }

        hashesByPath[relPath] = hashContent(content);
    }

    const path = SyncManifestFile.path(context);
    const existedBefore = await filesystem.exists(path);

    await filesystem.mkdir(dirname(path));

    await filesystem.writeFile({
        content: new SyncManifestFile(hashesByPath).serialize(),
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

interface SaveSyncManifestFileOptions {
    context: RunContext;
    artifactPaths: string[];
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
