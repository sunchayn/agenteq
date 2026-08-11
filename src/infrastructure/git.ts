import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * A standardized service for git operations.
 */
const git = {
    ignore: ignore,
    trackedPaths: trackedPaths,
};

export default git;

/*
 * Interface & Types.
 */

interface IgnoreOptions {
    cwd: string;
    relPath: string;
}

interface TrackedPathsOptions {
    cwd: string;
    relPaths: string[];
}

/*
 * Internal.
 */

/**
 * Appends a path to the project's .gitignore if it is not ignored already.
 * If the file doesn't exist, it will be created on the spot.
 */
async function ignore(options: IgnoreOptions): Promise<void> {
    const { cwd, relPath } = options;

    const gitignorePath = join(cwd, ".gitignore");

    let contents = "";

    try {
        contents = await readFile(gitignorePath, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
        }
    }

    // Exact-line match only, a broader pattern that already covers this path,
    // such as .ai/*, will not be recognized and this line gets added anyway.
    const alreadyCovered = contents
        .split("\n")
        .some((line) => line.trim() === relPath);

    if (alreadyCovered) {
        return;
    }

    const prefix = contents.length > 0 && !contents.endsWith("\n") ? "\n" : "";

    await writeFile(gitignorePath, `${contents}${prefix}${relPath}\n`, "utf8");
}

/**
 * Returns which of the given paths already have at least one file tracked by git.
 */
function trackedPaths(options: TrackedPathsOptions): Set<string> {
    const { cwd, relPaths } = options;

    if (relPaths.length === 0) {
        return new Set();
    }

    // A single ls-files call covers every path at once, instead of one process per path.
    const result = spawnSync("git", ["ls-files", "--", ...relPaths], {
        cwd: cwd,
        encoding: "utf8",
    });

    if (result.status !== 0 || !result.stdout) {
        // Includes running outside a git repo, treated the same as nothing tracked.
        return new Set();
    }

    const trackedFiles = result.stdout.split("\n").filter(Boolean);

    return new Set(
        relPaths.filter((relPath) =>
            trackedFiles.some(
                (file) => file === relPath || file.startsWith(`${relPath}/`),
            ),
        ),
    );
}
