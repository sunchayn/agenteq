import { dirname, relative } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import git from "@infrastructure/git.js";
import RemoteSourcesFile, {
    type RemoteSourceEntry,
} from "@artifacts/entities/remote-sources-file.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Writes agenteq's saved remote sources file to disk, git tracked by default.
 * Pass `shouldIgnore` to keep it out of git instead (applicable only the first time a remote is added).
 */
export default async function saveRemoteSourcesFileAction(
    options: SaveRemoteSourcesFileOptions,
): Promise<void> {
    const { context, remotes, shouldIgnore } = options;

    const path = RemoteSourcesFile.path(context);
    const existedBefore = await filesystem.exists(path);

    await filesystem.mkdir(dirname(path));

    await filesystem.writeFile({
        content: new RemoteSourcesFile(remotes).serialize(),
        path: path,
    });

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

interface SaveRemoteSourcesFileOptions {
    context: RunContext;
    remotes: Record<string, RemoteSourceEntry>;
    shouldIgnore: boolean;
}
