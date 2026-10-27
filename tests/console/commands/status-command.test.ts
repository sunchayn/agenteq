import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import saveAgentsFileAction from "@agents/actions/save-agents-file-action.js";
import saveRemoteClonePathAction from "@agents/actions/save-remote-clone-path-action.js";
import saveRemoteSourcesFileAction from "@artifacts/actions/save-remote-sources-file-action.js";
import saveSyncManifestFileAction from "@artifacts/actions/save-sync-manifest-file-action.js";
import type { RunContext } from "@shared/types/run-context.js";
import { createProgram } from "./command-test-helpers.js";

const { registerStatusCommand } = await import("@console/commands/status.js");

function program(): Command {
    return createProgram(registerStatusCommand);
}

function runGit(dir: string, args: string[]): void {
    spawnSync("git", args, { cwd: dir });
}

async function runStatusAsJson(): Promise<Record<string, unknown>> {
    const writeSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);

    await program().parseAsync(["node", "agenteq", "status", "--json"]);

    const payload = JSON.parse(
        writeSpy.mock.calls.map(([chunk]) => String(chunk)).join(""),
    ) as Record<string, unknown>;

    writeSpy.mockRestore();

    return payload;
}

let originalCwd: string;
let cwd: string;
let context: RunContext;

beforeEach(async () => {
    originalCwd = process.cwd();
    cwd = await mkdtemp(join(tmpdir(), "agenteq-status-command-"));
    process.chdir(cwd);
    context = { cwd: cwd, sourceDir: ".ai" };
});

afterEach(async () => {
    process.chdir(originalCwd);
    await rm(cwd, { force: true, recursive: true });
});

describe("agenteq status: nothing configured", () => {
    it("reports no agents and no remote sources", async () => {
        const payload = await runStatusAsJson();

        expect(payload.agents).toEqual([]);
        expect(payload.remoteSources).toEqual([]);
        expect(payload.handEditedArtifacts).toEqual([]);
        expect(payload.trackedArtifacts).toEqual([]);
    });
});

describe("agenteq status: configured agents and remote sources", () => {
    it("lists saved agents and each remote source with its pin and commit", async () => {
        await saveAgentsFileAction({
            agentNames: ["claude_code"],
            capabilities: [],
            context: context,
            isCopyMode: undefined,
        });

        const cloneDir = join(cwd, "clone");

        await mkdir(cloneDir);
        runGit(cloneDir, ["init", "--quiet"]);
        runGit(cloneDir, ["config", "user.email", "test@example.com"]);
        runGit(cloneDir, ["config", "user.name", "Test"]);
        await writeFile(join(cloneDir, "GUIDELINES.md"), "hello", "utf8");
        runGit(cloneDir, ["add", "GUIDELINES.md"]);
        runGit(cloneDir, ["commit", "--quiet", "-m", "commit"]);

        await saveRemoteSourcesFileAction({
            context: context,
            remotes: {
                team: {
                    ref: "v1.0.0",
                    selection: {
                        commands: [],
                        guidelines: true,
                        mcp: [],
                        references: [],
                        skills: [],
                    },
                    url: "git@example.com:org/team.git",
                },
            },
            shouldIgnore: false,
        });

        await saveRemoteClonePathAction({
            context: context,
            name: "team",
            path: cloneDir,
        });

        const payload = await runStatusAsJson();

        expect(payload.agents).toEqual(["claude_code"]);

        const [remote] = payload.remoteSources as {
            name: string;
            url: string;
            pinned: string;
            commit: string | undefined;
        }[];

        expect(remote.name).toBe("team");
        expect(remote.url).toBe("git@example.com:org/team.git");
        expect(remote.pinned).toBe("v1.0.0");
        expect(remote.commit).toMatch(/^[0-9a-f]+$/);
    });
});

describe("agenteq status: sync drift", () => {
    it("flags an artifact edited by hand since the last sync", async () => {
        await writeFile(join(cwd, "CLAUDE.md"), "hello", "utf8");

        await saveSyncManifestFileAction({
            artifactPaths: ["CLAUDE.md"],
            context: context,
        });

        await writeFile(join(cwd, "CLAUDE.md"), "hand-edited", "utf8");

        const payload = await runStatusAsJson();

        expect(payload.handEditedArtifacts).toEqual(["CLAUDE.md"]);
    });

    it("flags a generated artifact that ended up tracked by git", async () => {
        runGit(cwd, ["init", "--quiet"]);
        runGit(cwd, ["config", "user.email", "test@example.com"]);
        runGit(cwd, ["config", "user.name", "Test"]);

        await writeFile(join(cwd, "CLAUDE.md"), "hello", "utf8");

        await saveSyncManifestFileAction({
            artifactPaths: ["CLAUDE.md"],
            context: context,
        });

        runGit(cwd, ["add", "CLAUDE.md"]);
        runGit(cwd, ["commit", "--quiet", "-m", "commit"]);

        const payload = await runStatusAsJson();

        expect(payload.trackedArtifacts).toEqual(["CLAUDE.md"]);
    });
});
