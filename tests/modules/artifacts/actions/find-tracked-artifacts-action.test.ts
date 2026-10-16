import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import type { RunContext } from "@shared/types/run-context.js";

const testAgent = new Agent({
    detectProjectPathUsing: () => createDetectionConfiguration({}),
    detectSystemPathUsing: () => createDetectionConfiguration({}),
    displayName: "Test Agent",
    guidelinesPath: "AGENT.md",
    name: "test_agent",
});

vi.mock("@agents/registry.js", () => ({ agentDefinitions: [testAgent] }));

const { default: findTrackedArtifactsAction } =
    await import("@artifacts/actions/find-tracked-artifacts-action.js");

const { default: saveAgentsFileAction } =
    await import("@agents/actions/save-agents-file-action.js");

function runGit(dir: string, args: string[]): void {
    spawnSync("git", args, { cwd: dir });
}

function initRepo(dir: string): void {
    runGit(dir, ["init", "--quiet"]);
    runGit(dir, ["config", "user.email", "test@example.com"]);
    runGit(dir, ["config", "user.name", "Test"]);
}

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-find-tracked-artifacts-"));
    context = { cwd: cwd, sourceDir: ".ai" };

    initRepo(cwd);

    await saveAgentsFileAction({
        agentNames: ["test_agent"],
        capabilities: Object.values(AgentCapability),
        context: context,
    });
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("findTrackedArtifactsAction", () => {
    it("returns no findings when the generated artifact isn't tracked by git", async () => {
        await writeFile(join(cwd, "AGENT.md"), "hello");

        expect(await findTrackedArtifactsAction({ context: context })).toEqual(
            [],
        );
    });

    it("returns no findings when the generated artifact doesn't exist on disk", async () => {
        expect(await findTrackedArtifactsAction({ context: context })).toEqual(
            [],
        );
    });

    it("reports a generated artifact that ended up tracked by git", async () => {
        await writeFile(join(cwd, "AGENT.md"), "hello");
        runGit(cwd, ["add", "AGENT.md"]);
        runGit(cwd, ["commit", "--quiet", "-m", "commit"]);

        const findings = await findTrackedArtifactsAction({
            context: context,
        });

        expect(findings).toHaveLength(1);
        expect(findings[0]?.message).toContain("AGENT.md");
        expect(findings[0]?.fixCommand).toBe("git rm -r --cached AGENT.md");
    });
});

describe("findTrackedArtifactsAction with no saved agents", () => {
    it("returns no findings when nothing was saved yet", async () => {
        const freshCwd = await mkdtemp(
            join(tmpdir(), "agenteq-find-tracked-artifacts-fresh-"),
        );

        const freshContext = { cwd: freshCwd, sourceDir: ".ai" };

        initRepo(freshCwd);

        try {
            expect(
                await findTrackedArtifactsAction({ context: freshContext }),
            ).toEqual([]);
        } finally {
            await rm(freshCwd, { force: true, recursive: true });
        }
    });
});
