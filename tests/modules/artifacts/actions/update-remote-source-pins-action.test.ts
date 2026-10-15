import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import git from "@infrastructure/git.js";
import updateRemoteSourcePinsAction from "@artifacts/actions/update-remote-source-pins-action.js";
import saveRemoteClonePathAction from "@agents/actions/save-remote-clone-path-action.js";
import saveRemoteSourcesFileAction from "@artifacts/actions/save-remote-sources-file-action.js";
import loadRemoteSourcesFileAction from "@artifacts/actions/load-remote-sources-file-action.js";
import type { RunContext } from "@shared/types/run-context.js";

const selection = {
    commands: [],
    guidelines: true,
    mcp: [],
    skills: [],
};

function runGit(dir: string, args: string[]): void {
    spawnSync("git", args, { cwd: dir });
}

async function commit(dir: string, name: string, content: string) {
    await writeFile(join(dir, name), content, "utf8");
    runGit(dir, ["add", name]);
    runGit(dir, ["commit", "--quiet", "-m", "commit"]);
}

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-update-pins-"));
    context = { cwd: cwd, sourceDir: ".ai" };
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("updateRemoteSourcePinsAction", () => {
    it("re-pins a remote to its newest tag and saves the manifest", async () => {
        const originDir = await mkdtemp(join(tmpdir(), "agenteq-pins-origin-"));

        runGit(originDir, ["init", "--quiet"]);
        runGit(originDir, ["config", "user.email", "test@example.com"]);
        runGit(originDir, ["config", "user.name", "Test"]);
        await commit(originDir, "GUIDELINES.md", "v1");
        runGit(originDir, ["tag", "v1.0.0"]);
        await commit(originDir, "second.md", "v2");
        runGit(originDir, ["tag", "v1.1.0"]);

        const clonePath = join(cwd, "clone");

        await git.clone({ targetDir: clonePath, url: originDir });
        await git.checkoutTag({ cwd: clonePath, tag: "v1.0.0" });

        await saveRemoteSourcesFileAction({
            context: context,
            remotes: {
                team: { ref: "v1.0.0", selection: selection, url: originDir },
            },
            shouldIgnore: false,
        });

        await saveRemoteClonePathAction({
            context: context,
            name: "team",
            path: clonePath,
        });

        const warnings = await updateRemoteSourcePinsAction({
            context: context,
        });

        expect(warnings).toEqual([]);

        const saved = await loadRemoteSourcesFileAction({ context: context });

        expect(saved.get("team")?.ref).toBe("v1.1.0");

        await rm(originDir, { force: true, recursive: true });
    });

    it("leaves an unpinned remote untouched", async () => {
        const originDir = await mkdtemp(join(tmpdir(), "agenteq-pins-origin-"));

        runGit(originDir, ["init", "--quiet"]);
        runGit(originDir, ["config", "user.email", "test@example.com"]);
        runGit(originDir, ["config", "user.name", "Test"]);
        await commit(originDir, "GUIDELINES.md", "v1");

        const clonePath = join(cwd, "clone");

        await git.clone({ targetDir: clonePath, url: originDir });

        await saveRemoteSourcesFileAction({
            context: context,
            remotes: {
                team: { selection: selection, url: originDir },
            },
            shouldIgnore: false,
        });

        await saveRemoteClonePathAction({
            context: context,
            name: "team",
            path: clonePath,
        });

        const warnings = await updateRemoteSourcePinsAction({
            context: context,
        });

        expect(warnings).toEqual([]);

        const saved = await loadRemoteSourcesFileAction({ context: context });

        expect(saved.get("team")?.ref).toBeUndefined();

        await rm(originDir, { force: true, recursive: true });
    });

    it("skips a pinned remote that has not been cloned yet", async () => {
        await saveRemoteSourcesFileAction({
            context: context,
            remotes: {
                team: {
                    ref: "v1.0.0",
                    selection: selection,
                    url: "https://example.invalid/team.git",
                },
            },
            shouldIgnore: false,
        });

        await saveRemoteClonePathAction({
            context: context,
            name: "team",
            path: join(cwd, "not-cloned-yet"),
        });

        const warnings = await updateRemoteSourcePinsAction({
            context: context,
        });

        expect(warnings).toEqual([]);

        const saved = await loadRemoteSourcesFileAction({ context: context });

        expect(saved.get("team")?.ref).toBe("v1.0.0");
    });

    it("warns, without changing the pin, when a remote's tags can't be fetched", async () => {
        const clonePath = join(cwd, "clone");

        runGit(cwd, ["init", "--quiet", clonePath]);
        runGit(clonePath, ["config", "user.email", "test@example.com"]);
        runGit(clonePath, ["config", "user.name", "Test"]);
        await commit(clonePath, "GUIDELINES.md", "v1");
        runGit(clonePath, ["tag", "v1.0.0"]);
        runGit(clonePath, [
            "remote",
            "add",
            "origin",
            "https://example.invalid/team.git",
        ]);

        await saveRemoteSourcesFileAction({
            context: context,
            remotes: {
                team: {
                    ref: "v1.0.0",
                    selection: selection,
                    url: "https://example.invalid/team.git",
                },
            },
            shouldIgnore: false,
        });

        await saveRemoteClonePathAction({
            context: context,
            name: "team",
            path: clonePath,
        });

        const warnings = await updateRemoteSourcePinsAction({
            context: context,
        });

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("Could not fetch tags");

        const saved = await loadRemoteSourcesFileAction({ context: context });

        expect(saved.get("team")?.ref).toBe("v1.0.0");
    });
});
