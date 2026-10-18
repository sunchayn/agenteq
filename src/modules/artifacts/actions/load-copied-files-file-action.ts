import filesystem from "@infrastructure/filesystem.js";
import CopiedFilesFile from "@artifacts/entities/copied-files-file.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Reads and parses Agenteq's saved record of copied files, an empty one when nothing was saved yet.
 */
export default async function loadCopiedFilesFileAction(
    options: LoadCopiedFilesFileOptions,
): Promise<CopiedFilesFile> {
    const { context } = options;

    const raw = await filesystem.readFile(CopiedFilesFile.path(context));

    return raw ? CopiedFilesFile.parse(raw) : new CopiedFilesFile();
}

/*
 * Interface & Types.
 */

interface LoadCopiedFilesFileOptions {
    context: RunContext;
}
