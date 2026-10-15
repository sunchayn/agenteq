import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import saveRemoteClonePathAction from "@agents/actions/save-remote-clone-path-action.js";
import saveRemoteSourcesFileAction from "@artifacts/actions/save-remote-sources-file-action.js";
import Agent, { type AgentOptions } from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import type { SyncOutcome } from "@artifacts/data-transfer-objects/sync-outcome.js";
import type { RunContext } from "@shared/types/run-context.js";

const { printSyncOutcomeMock } = vi.hoisted(() => ({
    printSyncOutcomeMock: vi.fn(),
}));

vi.mock("@console/actions/concerns/print-sync-outcome.js", () => ({
    printSyncOutcome: printSyncOutcomeMock,
}));

const { default: syncArtifactsAction } =
    await import("@console/actions/sync-artifacts-action.js");

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

async function commit(dir: string, name: string, content: string) {
    await writeFile(join(dir, name), content, "utf8");
    runGit(dir, ["add", name]);
    runGit(dir, ["commit", "--quiet", "-m", "commit"]);
}

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-sync-artifacts-action-"));
    context = { cwd: cwd, sourceDir: ".ai" };
    printSyncOutcomeMock.mockReset();
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

async function setUpPinnedRemote(): Promise<string> {
    const originDir = await mkdtemp(
        join(tmpdir(), "agenteq-sync-artifacts-origin-"),
    );

    runGit(originDir, ["init", "--quiet"]);
    runGit(originDir, ["config", "user.email", "test@example.com"]);
    runGit(originDir, ["config", "user.name", "Test"]);
    await commit(originDir, "GUIDELINES.md", "v1");
    runGit(originDir, ["tag", "v1.0.0"]);
    await commit(originDir, "second.md", "v2");
    runGit(originDir, ["tag", "v1.1.0"]);

    const clonePath = join(cwd, "clone");

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

    return originDir;
}

describe("syncArtifactsAction shouldUpdatePins", () => {
    it("re-pins to the newest tag before syncing, so no staleness warning is printed", async () => {
        const originDir = await setUpPinnedRemote();

        // An initial sync establishes the clone, pinned at the older tag like `add` would leave it.
        await syncArtifactsAction({
            agents: [new Agent(agentOptions)],
            capabilities: [AgentCapability.Guidelines],
            context: context,
            isJson: true,
            label: "test",
            shouldSkipPrompts: true,
        });

        printSyncOutcomeMock.mockReset();

        await syncArtifactsAction({
            agents: [new Agent(agentOptions)],
            capabilities: [AgentCapability.Guidelines],
            context: context,
            isJson: true,
            label: "test",
            shouldSkipPrompts: true,
            shouldUpdatePins: true,
        });

        const outcome = printSyncOutcomeMock.mock.calls[0]?.[0]
            .outcome as SyncOutcome;

        expect(outcome.remoteSourceWarnings).toEqual([]);

        await rm(originDir, { force: true, recursive: true });
    });

    it("warns about a stale pin when --update-pins is not passed", async () => {
        const originDir = await setUpPinnedRemote();

        await syncArtifactsAction({
            agents: [new Agent(agentOptions)],
            capabilities: [AgentCapability.Guidelines],
            context: context,
            isJson: true,
            label: "test",
            shouldSkipPrompts: true,
        });

        const outcome = printSyncOutcomeMock.mock.calls[0]?.[0]
            .outcome as SyncOutcome;

        expect(
            outcome.remoteSourceWarnings.some((warning) =>
                warning.includes("is pinned to"),
            ),
        ).toBe(true);

        await rm(originDir, { force: true, recursive: true });
    });
});
