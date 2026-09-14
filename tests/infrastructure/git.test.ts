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
    spawnSync("git", args, { cwd: cwd });
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
        await git.ignore({ cwd: cwd, relPath: ".ai/agenteq.json" });
        const contents = await readFile(join(cwd, ".gitignore"), "utf8");

        expect(contents).toBe(".ai/agenteq.json\n");
    });

    it("appends to an existing .gitignore", async () => {
        await writeFile(join(cwd, ".gitignore"), "node_modules/\n", "utf8");
        await git.ignore({ cwd: cwd, relPath: ".ai/agenteq.json" });
        const contents = await readFile(join(cwd, ".gitignore"), "utf8");

        expect(contents).toBe("node_modules/\n.ai/agenteq.json\n");
    });

    it("does not duplicate an already-present line", async () => {
        await writeFile(
            join(cwd, ".gitignore"),
            "node_modules/\n.ai/agenteq.json\n",
            "utf8",
        );

        await git.ignore({ cwd: cwd, relPath: ".ai/agenteq.json" });
        const contents = await readFile(join(cwd, ".gitignore"), "utf8");

        expect(contents).toBe("node_modules/\n.ai/agenteq.json\n");
    });

    it("matches on a trimmed comparison", async () => {
        await writeFile(
            join(cwd, ".gitignore"),
            "node_modules/\n.ai/agenteq.json  \n",
            "utf8",
        );

        await git.ignore({ cwd: cwd, relPath: ".ai/agenteq.json" });
        const contents = await readFile(join(cwd, ".gitignore"), "utf8");

        expect(contents).toBe("node_modules/\n.ai/agenteq.json  \n");
    });

    it("does not add a line when a parent folder is already ignored", async () => {
        await writeFile(join(cwd, ".gitignore"), ".ai/\n", "utf8");

        await git.ignore({ cwd: cwd, relPath: ".ai/agenteq.json" });
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
