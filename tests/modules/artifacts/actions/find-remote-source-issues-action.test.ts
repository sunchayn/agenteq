import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import findRemoteSourceIssuesAction from "@artifacts/actions/find-remote-source-issues-action.js";
import saveRemoteSourcesFileAction from "@artifacts/actions/save-remote-sources-file-action.js";
import saveRemoteClonePathAction from "@agents/actions/save-remote-clone-path-action.js";
import type { RunContext } from "@shared/types/run-context.js";

const selection = { commands: [], guidelines: true, mcp: [], skills: [] };

function runGit(dir: string, args: string[]): void {
    spawnSync("git", args, { cwd: dir });
}

function initRepoWithRemote(dir: string, originUrl: string): void {
    runGit(dir, ["init", "--quiet"]);
    runGit(dir, ["config", "user.email", "test@example.com"]);
    runGit(dir, ["config", "user.name", "Test"]);
    runGit(dir, ["remote", "add", "origin", originUrl]);
}

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-find-remote-source-issues-"));
    context = { cwd: cwd, sourceDir: ".ai" };
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("findRemoteSourceIssuesAction", () => {
    it("returns no findings when no remote source is configured", async () => {
        expect(
            await findRemoteSourceIssuesAction({ context: context }),
        ).toEqual([]);
    });

    it("returns no findings when the clone exists and its origin matches", async () => {
        const clonePath = join(cwd, "clone");

        await mkdir(clonePath, { recursive: true });
        initRepoWithRemote(clonePath, "https://example.invalid/team.git");

        await saveRemoteSourcesFileAction({
            context: context,
            remotes: {
                team: {
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

        expect(
            await findRemoteSourceIssuesAction({ context: context }),
        ).toEqual([]);
    });

    it("reports a missing clone, with the fix command", async () => {
        await saveRemoteSourcesFileAction({
            context: context,
            remotes: {
                team: {
                    selection: selection,
                    url: "https://example.invalid/team.git",
                },
            },
            shouldIgnore: false,
        });

        await saveRemoteClonePathAction({
            context: context,
            name: "team",
            path: join(cwd, "does-not-exist"),
        });

        const findings = await findRemoteSourceIssuesAction({
            context: context,
        });

        expect(findings).toHaveLength(1);
        expect(findings[0]?.message).toContain("team");
        expect(findings[0]?.message).toContain("no longer exists");
        expect(findings[0]?.fixCommand).toBe("agenteq sync");
    });

    it("reports a clone whose origin no longer matches the recorded URL", async () => {
        const clonePath = join(cwd, "clone");

        await mkdir(clonePath, { recursive: true });
        initRepoWithRemote(clonePath, "https://example.invalid/drifted.git");

        await saveRemoteSourcesFileAction({
            context: context,
            remotes: {
                team: {
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

        const findings = await findRemoteSourceIssuesAction({
            context: context,
        });

        expect(findings).toHaveLength(1);
        expect(findings[0]?.message).toContain("drifted.git");
        expect(findings[0]?.fixCommand).toBe(
            "agenteq remote-source remove team && agenteq remote-source add team https://example.invalid/team.git",
        );
    });
});
