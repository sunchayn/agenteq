import RemoteSourcesFile, {
    type RemoteSourceEntry,
} from "@artifacts/entities/remote-sources-file.js";
import writeTrackedStateFileAction from "@shared/actions/write-tracked-state-file-action.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Writes agenteq's saved remote sources file to disk, git tracked by default.
 * Pass `shouldIgnore` to keep it out of git instead (applicable only the first time a remote is added).
 */
export default async function saveRemoteSourcesFileAction(
    options: SaveRemoteSourcesFileOptions,
): Promise<void> {
    const { context, remotes, shouldIgnore } = options;

    await writeTrackedStateFileAction({
        content: new RemoteSourcesFile(remotes).serialize(),
        context: context,
        path: RemoteSourcesFile.path(context),
        shouldIgnore: shouldIgnore,
    });
}

/*
 * Interface & Types.
 */

interface SaveRemoteSourcesFileOptions {
    context: RunContext;
    remotes: Record<string, RemoteSourceEntry>;
    shouldIgnore: boolean;
}
