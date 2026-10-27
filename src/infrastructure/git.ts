import { spawn, spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * A standardized service for git operations.
 */
const git = {
    checkoutBranch: checkoutBranch,
    checkoutTag: checkoutTag,
    clone: clone,
    currentCommit: currentCommit,
    currentTag: currentTag,
    defaultBranch: defaultBranch,
    fetchTags: fetchTags,
    ignore: ignore,
    listTags: listTags,
    pull: pull,
    remoteUrl: remoteUrl,
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

interface CloneOptions {
    url: string;
    targetDir: string;
}

interface PullOptions {
    cwd: string;
}

interface RemoteUrlOptions {
    cwd: string;
}

interface FetchTagsOptions {
    cwd: string;
}

interface ListTagsOptions {
    cwd: string;
}

interface CheckoutTagOptions {
    cwd: string;
    tag: string;
}

interface CurrentTagOptions {
    cwd: string;
}

interface CurrentCommitOptions {
    cwd: string;
}

interface DefaultBranchOptions {
    cwd: string;
}

interface CheckoutBranchOptions {
    cwd: string;
    branch: string;
}

interface GitCommandResult {
    isSuccessful: boolean;
    detail?: string;
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

    const alreadyIgnored =
        spawnSync("git", ["check-ignore", "--quiet", "--", relPath], {
            cwd: cwd,
        }).status === 0;

    if (alreadyIgnored) {
        return;
    }

    let contents = "";

    try {
        contents = await readFile(gitignorePath, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
        }
    }

    const prefix = contents.length > 0 && !contents.endsWith("\n") ? "\n" : "";

    await writeFile(gitignorePath, `${contents}${prefix}${relPath}\n`, "utf8");
}

/**
 * Clones a repository into targetDir.
 */
async function clone(options: CloneOptions): Promise<GitCommandResult> {
    const { targetDir, url } = options;

    return runGitAsync(["clone", "--", url, targetDir]);
}

/**
 * Fast-forward-only pulls an existing clone.
 */
async function pull(options: PullOptions): Promise<GitCommandResult> {
    const { cwd } = options;

    return runGitAsync(["pull", "--ff-only"], cwd);
}

/**
 * Reads a clone's configured `origin` url, or undefined when it has none or isn't a git repository.
 */
function remoteUrl(options: RemoteUrlOptions): string | undefined {
    const { cwd } = options;

    const result = spawnSync("git", ["remote", "get-url", "origin"], {
        cwd: cwd,
        encoding: "utf8",
    });

    return result.status === 0 ? result.stdout.trim() : undefined;
}

/**
 * Fetches every tag from origin.
 */
async function fetchTags(options: FetchTagsOptions): Promise<GitCommandResult> {
    const { cwd } = options;

    return runGitAsync(["fetch", "--tags", "--force"], cwd);
}

/**
 * Lists every local tag, newest release first.
 */
function listTags(options: ListTagsOptions): string[] {
    const { cwd } = options;

    const result = spawnSync("git", ["tag", "--sort=-v:refname"], {
        cwd: cwd,
        encoding: "utf8",
    });

    if (result.status !== 0 || !result.stdout) {
        return [];
    }

    return result.stdout.split("\n").filter(Boolean);
}

/**
 * Checks out a tag directly, detached from any branch.
 */
async function checkoutTag(
    options: CheckoutTagOptions,
): Promise<GitCommandResult> {
    const { cwd, tag } = options;

    return runGitAsync(["checkout", "--detach", `tags/${tag}`], cwd);
}

/**
 * Returns the tag HEAD currently points at, or undefined when it isn't on one.
 */
function currentTag(options: CurrentTagOptions): string | undefined {
    const { cwd } = options;

    const result = spawnSync("git", ["describe", "--tags", "--exact-match"], {
        cwd: cwd,
        encoding: "utf8",
    });

    return result.status === 0 ? result.stdout.trim() : undefined;
}

/**
 * Returns HEAD's short commit hash, or undefined when `cwd` isn't a git working tree.
 */
function currentCommit(options: CurrentCommitOptions): string | undefined {
    const { cwd } = options;

    const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
        cwd: cwd,
        encoding: "utf8",
    });

    return result.status === 0 ? result.stdout.trim() : undefined;
}

/**
 * Returns the name of origin's default branch.
 */
function defaultBranch(options: DefaultBranchOptions): string | undefined {
    const { cwd } = options;

    const result = spawnSync(
        "git",
        ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
        { cwd: cwd, encoding: "utf8" },
    );

    return result.status === 0
        ? result.stdout.trim().replace(/^origin\//, "")
        : undefined;
}

/**
 * Checks out an existing branch.
 */
async function checkoutBranch(
    options: CheckoutBranchOptions,
): Promise<GitCommandResult> {
    const { branch, cwd } = options;

    return runGitAsync(["checkout", branch], cwd);
}

/**
 * Runs a git subcommand through the async, non-blocking `spawn`.
 */
function runGitAsync(args: string[], cwd?: string): Promise<GitCommandResult> {
    return new Promise((resolvePromise) => {
        const child = spawn("git", args, { cwd: cwd });

        let stderr = "";

        child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        child.on("error", (error) => {
            resolvePromise({ detail: error.message, isSuccessful: false });
        });

        child.on("close", (code) => {
            resolvePromise({
                detail: code === 0 ? undefined : stderr.trim(),
                isSuccessful: code === 0,
            });
        });
    });
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
