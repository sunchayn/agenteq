import {
    access,
    cp,
    copyFile,
    mkdir as mkdirAsync,
    readdir,
    readFile as readFileAsync,
    readlink,
    rm,
    symlink,
    writeFile as writeFileAsync,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import fg from "fast-glob";

/**
 * A standardized service to deal with the filesystem.
 */
export default {
    copy: copy,
    exists: exists,
    glob: glob,
    mkdir: mkdir,
    readFile: readFile,
    remove: remove,
    removeSymlinksInto: removeSymlinksInto,
    symlinkOrCopy: symlinkOrCopy,
    writeFile: writeFile,
};

/*
 * Interface & Types.
 */

interface GlobOptions {
    pattern: string;
    cwd?: string;
    dot?: boolean;
    onlyFiles?: boolean;
    onlyDirectories?: boolean;
}

interface WriteFileOptions {
    path: string;
    content: string;
}

interface SymlinkOrCopyOptions {
    source: string;
    target: string;
}

interface RemoveSymlinksIntoOptions {
    targetDir: string;
    sourceDir: string;
}

interface CopyOptions {
    source: string;
    target: string;
}

/*
 * Internal.
 */

async function readFile(path: string): Promise<string | undefined> {
    try {
        return await readFileAsync(path, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return undefined;
        }

        throw error;
    }
}

async function writeFile(options: WriteFileOptions): Promise<void> {
    const { content, path } = options;

    await writeFileAsync(path, content, "utf8");
}

async function exists(path: string): Promise<boolean> {
    try {
        await access(path);

        return true;
    } catch {
        return false;
    }
}

async function glob(options: GlobOptions): Promise<string[]> {
    const { pattern, ...globOptions } = options;

    return fg(pattern, globOptions);
}

/**
 * Symlinks or falls back to a copy wherever symlinks aren't permitted, e.g. Windows without developer mode enabled.
 */
async function symlinkOrCopy(options: SymlinkOrCopyOptions): Promise<void> {
    const { source, target } = options;

    try {
        await symlink(relative(dirname(target), source), target);
    } catch {
        await copyFile(source, target);
    }
}

async function copy(options: CopyOptions): Promise<void> {
    const { source, target } = options;

    await cp(source, target, { recursive: true });
}

async function mkdir(path: string): Promise<void> {
    await mkdirAsync(path, { recursive: true });
}

async function remove(path: string): Promise<void> {
    await rm(path, { force: true, recursive: true });
}

/**
 * Walks targetDir and removes every symlink whose destination resolves inside sourceDir.
 * A real file or a symlink pointing elsewhere, such as one the agent or the user placed there, is left untouched.
 */
async function removeSymlinksInto(
    options: RemoveSymlinksIntoOptions,
): Promise<void> {
    const { sourceDir, targetDir } = options;

    await pruneSymlinksInto(targetDir, resolve(sourceDir));
}

async function pruneSymlinksInto(
    dir: string,
    resolvedSourceDir: string,
): Promise<void> {
    let entries;

    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return;
        }

        throw error;
    }

    for (const entry of entries) {
        const entryPath = join(dir, entry.name);

        if (entry.isDirectory()) {
            await pruneSymlinksInto(entryPath, resolvedSourceDir);
            continue;
        }

        if (!entry.isSymbolicLink()) {
            continue;
        }

        const resolvedLinkTarget = resolve(
            dirname(entryPath),
            await readlink(entryPath),
        );

        // A file directly inside sourceDir counts the same as one nested under it,
        // so the check accepts an exact match alongside the usual prefix match.
        const pointsIntoSource =
            resolvedLinkTarget === resolvedSourceDir ||
            resolvedLinkTarget.startsWith(`${resolvedSourceDir}/`);

        if (pointsIntoSource) {
            await rm(entryPath, { force: true });
        }
    }
}
