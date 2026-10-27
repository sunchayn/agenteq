import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import git from "@infrastructure/git.js";

function initRepo(dir: string): void {
    runGit(dir, ["init", "--quiet"]);
    runGit(dir, ["config", "user.email", "test@example.com"]);
    runGit(dir, ["config", "user.name", "Test"]);
}

async function commitFile(
    dir: string,
    name: string,
    content: string,
): Promise<void> {
    await writeFile(join(dir, name), content, "utf8");
    runGit(dir, ["add", name]);
    runGit(dir, ["commit", "--quiet", "-m", "commit"]);
}

function runGit(cwd: string, args: string[]): void {
    const result = spawnSync("git", args, { cwd: cwd, encoding: "utf8" });

    if (result.status !== 0) {
        throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
    }
}

let cwd: string;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-gitignore-"));
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("git.ignore", () => {
    beforeEach(() => {
        runGit(cwd, ["init", "--quiet"]);
    });

    it("creates .gitignore when it doesn't exist", async () => {
        await git.ignore({ cwd: cwd, relPath: ".ai/agenteq/config.json" });
        const contents = await readFile(join(cwd, ".gitignore"), "utf8");

        expect(contents).toBe(".ai/agenteq/config.json\n");
    });

    it("appends to an existing .gitignore", async () => {
        await writeFile(join(cwd, ".gitignore"), "node_modules/\n", "utf8");
        await git.ignore({ cwd: cwd, relPath: ".ai/agenteq/config.json" });
        const contents = await readFile(join(cwd, ".gitignore"), "utf8");

        expect(contents).toBe("node_modules/\n.ai/agenteq/config.json\n");
    });

    it("does not duplicate an already-present line", async () => {
        await writeFile(
            join(cwd, ".gitignore"),
            "node_modules/\n.ai/agenteq/config.json\n",
            "utf8",
        );

        await git.ignore({ cwd: cwd, relPath: ".ai/agenteq/config.json" });
        const contents = await readFile(join(cwd, ".gitignore"), "utf8");

        expect(contents).toBe("node_modules/\n.ai/agenteq/config.json\n");
    });

    it("matches on a trimmed comparison", async () => {
        await writeFile(
            join(cwd, ".gitignore"),
            "node_modules/\n.ai/agenteq/config.json  \n",
            "utf8",
        );

        await git.ignore({ cwd: cwd, relPath: ".ai/agenteq/config.json" });
        const contents = await readFile(join(cwd, ".gitignore"), "utf8");

        expect(contents).toBe("node_modules/\n.ai/agenteq/config.json  \n");
    });

    it("does not add a line when a parent folder is already ignored", async () => {
        await writeFile(join(cwd, ".gitignore"), ".ai/\n", "utf8");

        await git.ignore({ cwd: cwd, relPath: ".ai/agenteq/config.json" });
        const contents = await readFile(join(cwd, ".gitignore"), "utf8");

        expect(contents).toBe(".ai/\n");
    });
});

describe("git.trackedPaths", () => {
    beforeEach(() => {
        runGit(cwd, ["init", "--quiet"]);
        runGit(cwd, ["config", "user.email", "test@example.com"]);
        runGit(cwd, ["config", "user.name", "Test"]);
    });

    it("returns an empty set when relPaths is empty", () => {
        expect(git.trackedPaths({ cwd: cwd, relPaths: [] })).toEqual(new Set());
    });

    it("returns an empty set when no path is tracked", async () => {
        await writeFile(join(cwd, "CLAUDE.md"), "hello", "utf8");

        expect(git.trackedPaths({ cwd: cwd, relPaths: ["CLAUDE.md"] })).toEqual(
            new Set(),
        );
    });

    it("flags a tracked file", async () => {
        await writeFile(join(cwd, "CLAUDE.md"), "hello", "utf8");
        runGit(cwd, ["add", "CLAUDE.md"]);

        expect(git.trackedPaths({ cwd: cwd, relPaths: ["CLAUDE.md"] })).toEqual(
            new Set(["CLAUDE.md"]),
        );
    });

    it("flags a directory when a file inside it is tracked", async () => {
        await mkdir(join(cwd, ".cursor/skills/example"), { recursive: true });
        await writeFile(
            join(cwd, ".cursor/skills/example/SKILL.md"),
            "hello",
            "utf8",
        );

        runGit(cwd, ["add", ".cursor/skills"]);

        expect(
            git.trackedPaths({ cwd: cwd, relPaths: [".cursor/skills"] }),
        ).toEqual(new Set([".cursor/skills"]));
    });

    it("only flags the paths that are actually tracked", async () => {
        await writeFile(join(cwd, "CLAUDE.md"), "hello", "utf8");
        await writeFile(join(cwd, "AGENTS.md"), "hello", "utf8");
        runGit(cwd, ["add", "CLAUDE.md"]);

        expect(
            git.trackedPaths({
                cwd: cwd,
                relPaths: ["CLAUDE.md", "AGENTS.md"],
            }),
        ).toEqual(new Set(["CLAUDE.md"]));
    });
});

describe("git.clone / git.pull / git.remoteUrl", () => {
    let originDir: string;
    let targetDir: string;

    beforeEach(async () => {
        originDir = await mkdtemp(join(tmpdir(), "agenteq-git-origin-"));
        targetDir = join(cwd, "clone");
        initRepo(originDir);
        await commitFile(originDir, "GUIDELINES.md", "hello");
    });

    afterEach(async () => {
        await rm(originDir, { force: true, recursive: true });
    });

    it("clones a repository into targetDir", async () => {
        const result = await git.clone({
            targetDir: targetDir,
            url: originDir,
        });

        expect(result.isSuccessful).toBe(true);
        expect(await readFile(join(targetDir, "GUIDELINES.md"), "utf8")).toBe(
            "hello",
        );
    });

    it("reports failure without throwing when the url is invalid", async () => {
        const result = await git.clone({
            targetDir: targetDir,
            url: join(tmpdir(), "agenteq-does-not-exist"),
        });

        expect(result.isSuccessful).toBe(false);
        expect(result.detail).toBeTruthy();
    });

    it("fast-forward pulls new commits from origin", async () => {
        await git.clone({ targetDir: targetDir, url: originDir });
        await commitFile(originDir, "second.md", "world");

        const result = await git.pull({ cwd: targetDir });

        expect(result.isSuccessful).toBe(true);
        expect(await readFile(join(targetDir, "second.md"), "utf8")).toBe(
            "world",
        );
    });

    it("reports failure without throwing when the clone has diverged", async () => {
        await git.clone({ targetDir: targetDir, url: originDir });
        runGit(targetDir, ["config", "user.email", "test@example.com"]);
        runGit(targetDir, ["config", "user.name", "Test"]);
        await commitFile(targetDir, "local-only.md", "local");
        await commitFile(originDir, "second.md", "world");

        const result = await git.pull({ cwd: targetDir });

        expect(result.isSuccessful).toBe(false);
    });

    it("reads the origin remote url of a clone", async () => {
        await git.clone({ targetDir: targetDir, url: originDir });

        expect(git.remoteUrl({ cwd: targetDir })).toBe(originDir);
    });

    it("returns undefined when the directory has no origin remote", () => {
        expect(git.remoteUrl({ cwd: cwd })).toBeUndefined();
    });
});

describe("git.fetchTags / git.listTags / git.checkoutTag / git.currentTag", () => {
    let originDir: string;
    let targetDir: string;

    beforeEach(async () => {
        originDir = await mkdtemp(join(tmpdir(), "agenteq-git-tags-origin-"));
        targetDir = join(cwd, "clone");
        initRepo(originDir);
        await commitFile(originDir, "GUIDELINES.md", "hello");
        runGit(originDir, ["tag", "v1.0.0"]);
        await commitFile(originDir, "second.md", "world");
        runGit(originDir, ["tag", "v1.1.0"]);
    });

    afterEach(async () => {
        await rm(originDir, { force: true, recursive: true });
    });

    it("lists tags newest first after cloning", async () => {
        await git.clone({ targetDir: targetDir, url: originDir });

        expect(git.listTags({ cwd: targetDir })).toEqual(["v1.1.0", "v1.0.0"]);
    });

    it("fetches a new tag pushed after the clone was made", async () => {
        await git.clone({ targetDir: targetDir, url: originDir });
        await commitFile(originDir, "third.md", "again");
        runGit(originDir, ["tag", "v1.2.0"]);

        const result = await git.fetchTags({ cwd: targetDir });

        expect(result.isSuccessful).toBe(true);
        expect(git.listTags({ cwd: targetDir })).toEqual([
            "v1.2.0",
            "v1.1.0",
            "v1.0.0",
        ]);
    });

    it("checks out an older tag, detached from the branch", async () => {
        await git.clone({ targetDir: targetDir, url: originDir });

        const result = await git.checkoutTag({ cwd: targetDir, tag: "v1.0.0" });

        expect(result.isSuccessful).toBe(true);
        expect(git.currentTag({ cwd: targetDir })).toBe("v1.0.0");
    });

    it("reports no current tag right after cloning, between releases", async () => {
        await git.clone({ targetDir: targetDir, url: originDir });
        runGit(targetDir, ["config", "user.email", "test@example.com"]);
        runGit(targetDir, ["config", "user.name", "Test"]);
        await commitFile(targetDir, "local.md", "untagged");

        expect(git.currentTag({ cwd: targetDir })).toBeUndefined();
    });
});

describe("git protocol retry", () => {
    let originDir: string;
    let targetDir: string;

    beforeEach(async () => {
        originDir = await mkdtemp(join(tmpdir(), "agenteq-git-retry-origin-"));
        targetDir = join(cwd, "clone");
        initRepo(originDir);
        await commitFile(originDir, "GUIDELINES.md", "hello");
    });

    afterEach(async () => {
        await rm(originDir, { force: true, recursive: true });
    });

    it("retries a clone's ssh:// url over https when both fail, naming both urls", async () => {
        const result = await git.clone({
            targetDir: targetDir,
            url: "ssh://git@127.0.0.1:1/owner/repo.git",
        });

        expect(result.isSuccessful).toBe(false);
        expect(result.detail).toContain("ssh://git@127.0.0.1:1/owner/repo.git");
        expect(result.detail).toContain("https://127.0.0.1:1/owner/repo.git");
    });

    it("retries a pull's scp-like origin over https when both fail, naming both urls", async () => {
        await git.clone({ targetDir: targetDir, url: originDir });
        runGit(targetDir, [
            "remote",
            "set-url",
            "origin",
            "git@127.0.0.1:owner/repo.git",
        ]);

        const result = await git.pull({ cwd: targetDir });

        expect(result.isSuccessful).toBe(false);
        expect(result.detail).toContain("git@127.0.0.1:owner/repo.git");
        expect(result.detail).toContain("https://127.0.0.1/owner/repo.git");
    });

    it("retries a tag fetch's https origin over ssh when both fail, naming both urls", async () => {
        await git.clone({ targetDir: targetDir, url: originDir });
        runGit(targetDir, [
            "remote",
            "set-url",
            "origin",
            "https://127.0.0.1/owner/repo.git",
        ]);

        const result = await git.fetchTags({ cwd: targetDir });

        expect(result.isSuccessful).toBe(false);
        expect(result.detail).toContain("https://127.0.0.1/owner/repo.git");
        expect(result.detail).toContain("git@127.0.0.1:owner/repo.git");
    });

    it("does not retry a local path, it is neither ssh nor https", async () => {
        const result = await git.clone({
            targetDir: targetDir,
            url: join(tmpdir(), "agenteq-does-not-exist"),
        });

        expect(result.isSuccessful).toBe(false);
        expect(result.detail).not.toMatch(/https:\/\/|git@/);
    });

    it("pulls real commits through an insteadOf-rewritten scp-like retry url, against a local bare repository", async () => {
        const bareDir = join(cwd, "bare.git");

        runGit(cwd, ["clone", "--quiet", "--bare", originDir, bareDir]);
        await git.clone({ targetDir: targetDir, url: bareDir });

        // The https origin targets a closed loopback port, so the first attempt fails fast with no real network dependency.
        // The extra slash before bareDir keeps its own leading slash in the retry's scp-like path, so that url stays absolute.
        runGit(targetDir, [
            "remote",
            "set-url",
            "origin",
            `https://127.0.0.1/${bareDir}`,
        ]);

        await commitFile(originDir, "retried.md", "it worked");
        runGit(originDir, ["push", "--quiet", bareDir, "HEAD"]);

        const sshWrapper = join(cwd, "fake-ssh.sh");

        await writeFile(sshWrapper, '#!/bin/bash\neval "${@: -1}"\n', "utf8");

        spawnSync("chmod", ["+x", sshWrapper]);

        const previousSshCommand = process.env.GIT_SSH_COMMAND;

        process.env.GIT_SSH_COMMAND = sshWrapper;

        try {
            const result = await git.pull({ cwd: targetDir });

            expect(result.isSuccessful).toBe(true);
            expect(await readFile(join(targetDir, "retried.md"), "utf8")).toBe(
                "it worked",
            );
        } finally {
            if (previousSshCommand === undefined) {
                delete process.env.GIT_SSH_COMMAND;
            } else {
                process.env.GIT_SSH_COMMAND = previousSshCommand;
            }
        }
    });
});

describe("git.currentCommit", () => {
    it("returns HEAD's short hash after cloning", async () => {
        const originDir = await mkdtemp(
            join(tmpdir(), "agenteq-git-commit-origin-"),
        );

        const targetDir = join(cwd, "clone");

        initRepo(originDir);
        await commitFile(originDir, "GUIDELINES.md", "hello");

        await git.clone({ targetDir: targetDir, url: originDir });

        expect(git.currentCommit({ cwd: targetDir })).toMatch(/^[0-9a-f]+$/);

        await rm(originDir, { force: true, recursive: true });
    });

    it("returns undefined outside a git working tree", () => {
        expect(git.currentCommit({ cwd: cwd })).toBeUndefined();
    });
});

describe("git.defaultBranch / git.checkoutBranch", () => {
    let originDir: string;
    let targetDir: string;

    beforeEach(async () => {
        originDir = await mkdtemp(join(tmpdir(), "agenteq-git-branch-origin-"));
        targetDir = join(cwd, "clone");
        initRepo(originDir);
        await commitFile(originDir, "GUIDELINES.md", "hello");
    });

    afterEach(async () => {
        await rm(originDir, { force: true, recursive: true });
    });

    it("reads the default branch recorded by a clone", async () => {
        await git.clone({ targetDir: targetDir, url: originDir });

        const branch = git.defaultBranch({ cwd: targetDir });

        const result = await git.checkoutBranch({
            branch: branch ?? "",
            cwd: targetDir,
        });

        expect(branch).toBeTruthy();
        expect(result.isSuccessful).toBe(true);
    });

    it("returns undefined when the directory has no origin remote", () => {
        expect(git.defaultBranch({ cwd: cwd })).toBeUndefined();
    });
});
