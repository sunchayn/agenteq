import { dirname, relative } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import git from "@infrastructure/git.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Writes a saved-state file's content to disk.
 * By default, these files are ignored unless `shouldIgnore` is false.
 */
export default async function writeTrackedStateFileAction(
    options: WriteTrackedStateFileOptions,
): Promise<void> {
    const { content, context, path, shouldIgnore = true } = options;

    const existedBefore = await filesystem.exists(path);

    await filesystem.mkdir(dirname(path));

    await filesystem.writeFile({ content: content, path: path });

    if (!existedBefore && shouldIgnore) {
        await git.ignore({
            cwd: context.cwd,
            relPath: relative(context.cwd, path),
        });
    }
}

/*
 * Interface & Types.
 */

export interface WriteTrackedStateFileOptions {
    context: RunContext;
    path: string;
    content: string;
    shouldIgnore?: boolean;
}
