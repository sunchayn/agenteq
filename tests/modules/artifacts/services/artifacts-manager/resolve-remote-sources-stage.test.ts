import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import resolveRemoteSourcesStage from "@artifacts/services/artifacts-manager/stages/resolve-remote-sources-stage.js";
import saveRemoteSourcesFileAction from "@artifacts/actions/save-remote-sources-file-action.js";
import { SyncPayload } from "@artifacts/data-transfer-objects/sync-payload.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import Agent, { type AgentOptions } from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import type { RunContext } from "@shared/types/run-context.js";

const agentOptions: AgentOptions = {
    detectProjectPathUsing: () => createDetectionConfiguration({}),
    detectSystemPathUsing: () => createDetectionConfiguration({}),
    displayName: "Test Agent",
    name: "test_agent",
};

const selection = {
    commands: [],
    guidelines: true,
    mcp: [],
    skills: [],
};

function runGit(dir: string, args: string[]): void {
    spawnSync("git", args, { cwd: dir });
}

function initOriginRepo(dir: string): void {
    runGit(dir, ["init", "--quiet"]);
    runGit(dir, ["config", "user.email", "test@example.com"]);
    runGit(dir, ["config", "user.name", "Test"]);
}

let cwd: string;
let context: RunContext;

function payload(): SyncPayload {
    return new SyncPayload({
        capabilities: [AgentCapability.Guidelines],
        context: context,
        selectedAgents: [new Agent(agentOptions)],
    });
}

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-resolve-remote-sources-"));
    context = { cwd: cwd, sourceDir: ".ai" };
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("resolveRemoteSourcesStage", () => {
    it("passes the payload through unchanged when no remote source is configured", async () => {
        const result = await resolveRemoteSourcesStage(payload());

        expect(result.remoteSources).toEqual([]);
        expect(result.remoteSourceWarnings).toEqual([]);
    });

    it("clones a remote source on first use and resolves it onto the payload", async () => {
        const originDir = await mkdtemp(
            join(tmpdir(), "agenteq-remote-origin-"),
        );

        initOriginRepo(originDir);
        await writeFile(join(originDir, "GUIDELINES.md"), "hello");
        runGit(originDir, ["add", "GUIDELINES.md"]);
        runGit(originDir, ["commit", "--quiet", "-m", "commit"]);

        const clonePath = join(cwd, "clone");

        await saveRemoteSourcesFileAction({
            context: context,
            remotes: {
                team: {
                    clonePath: clonePath,
                    selection: selection,
                    url: originDir,
                },
            },
            shouldIgnore: false,
        });

        const result = await resolveRemoteSourcesStage(payload());

        expect(result.remoteSources).toEqual([
            {
                name: "team",
                rootDir: clonePath,
                selection: selection,
                url: originDir,
            },
        ]);

        expect(result.remoteSourceWarnings).toEqual([]);

        await rm(originDir, { force: true, recursive: true });
    });

    it("resolves every configured remote, in the order they were added", async () => {
        const firstOrigin = await mkdtemp(
            join(tmpdir(), "agenteq-remote-origin-"),
        );

        const secondOrigin = await mkdtemp(
            join(tmpdir(), "agenteq-remote-origin-"),
        );

        for (const origin of [firstOrigin, secondOrigin]) {
            initOriginRepo(origin);
            await writeFile(join(origin, "GUIDELINES.md"), "hello");
            runGit(origin, ["add", "GUIDELINES.md"]);
            runGit(origin, ["commit", "--quiet", "-m", "commit"]);
        }

        await saveRemoteSourcesFileAction({
            context: context,
            remotes: {
                first: {
                    clonePath: join(cwd, "first-clone"),
                    selection: selection,
                    url: firstOrigin,
                },
                second: {
                    clonePath: join(cwd, "second-clone"),
                    selection: selection,
                    url: secondOrigin,
                },
            },
            shouldIgnore: false,
        });

        const result = await resolveRemoteSourcesStage(payload());

        expect(result.remoteSources.map((remote) => remote.name)).toEqual([
            "first",
            "second",
        ]);

        await rm(firstOrigin, { force: true, recursive: true });
        await rm(secondOrigin, { force: true, recursive: true });
    });

    it("warns and drops a remote when its clone fails and none existed before", async () => {
        await saveRemoteSourcesFileAction({
            context: context,
            remotes: {
                team: {
                    clonePath: join(cwd, "clone"),
                    selection: selection,
                    url: join(tmpdir(), "agenteq-does-not-exist"),
                },
            },
            shouldIgnore: false,
        });

        const result = await resolveRemoteSourcesStage(payload());

        expect(result.remoteSources).toEqual([]);
        expect(result.remoteSourceWarnings).toHaveLength(1);
        expect(result.remoteSourceWarnings[0]).toContain("Could not clone");
        expect(result.remoteSourceWarnings[0]).toContain("team");
    });

    it("warns but still resolves a remote when a pull fails on an existing clone", async () => {
        const clonePath = join(cwd, "clone");

        await mkdir(clonePath, { recursive: true });
        initOriginRepo(clonePath);
        await writeFile(join(clonePath, "GUIDELINES.md"), "hello");
        runGit(clonePath, ["add", "GUIDELINES.md"]);
        runGit(clonePath, ["commit", "--quiet", "-m", "commit"]);

        // No origin remote configured, so `git pull` fails without any network involved.
        await saveRemoteSourcesFileAction({
            context: context,
            remotes: {
                team: {
                    clonePath: clonePath,
                    selection: selection,
                    url: "https://example.invalid/team.git",
                },
            },
            shouldIgnore: false,
        });

        const result = await resolveRemoteSourcesStage(payload());

        expect(result.remoteSourceWarnings).toHaveLength(1);
        expect(result.remoteSourceWarnings[0]).toContain("Could not pull");
        expect(result.remoteSources[0]?.rootDir).toBe(clonePath);
    });
});
