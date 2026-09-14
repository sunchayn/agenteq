import filesystem from "@infrastructure/filesystem.js";
import RemoteSourcesFile from "@artifacts/entities/remote-sources-file.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Reads and parses Agenteq's saved remote sources file, an empty one when nothing was saved yet.
 */
export default async function loadRemoteSourcesFileAction(
    options: LoadRemoteSourcesFileOptions,
): Promise<RemoteSourcesFile> {
    const { context } = options;

    const raw = await filesystem.readFile(RemoteSourcesFile.path(context));

    return raw ? RemoteSourcesFile.parse(raw) : new RemoteSourcesFile();
}

/*
 * Interface & Types.
 */

interface LoadRemoteSourcesFileOptions {
    context: RunContext;
}
