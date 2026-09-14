import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import syncSymlinkCapabilityStage from "@artifacts/services/artifacts-manager/stages/sync-symlink-capability-stage.js";
import Agent, { type AgentOptions } from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import { SyncPayload } from "@artifacts/data-transfer-objects/sync-payload.js";
import type { RunContext } from "@shared/types/run-context.js";
import { AGENTEQ_SOURCES_ROOT } from "@support/utils/agenteq-sources-root.js";

const agentOptions: AgentOptions = {
    detectProjectPathUsing: () => createDetectionConfiguration({}),
    detectSystemPathUsing: () => createDetectionConfiguration({}),
    displayName: "Test Agent",
    name: "test_agent",
    skillsDir: ".test/skills",
};

let cwd: string;
let remoteClone: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-orphan-test-"));

    // Placed under the real default clone root, the exact spot `remote-source add` uses,
    // so this exercises the same path the fix reconciles against.
    await mkdir(AGENTEQ_SOURCES_ROOT, { recursive: true });
    remoteClone = await mkdtemp(join(AGENTEQ_SOURCES_ROOT, "orphan-test-"));
    context = { cwd: cwd, sourceDir: ".ai" };

    await mkdir(join(remoteClone, "skills", "remote-skill"), {
        recursive: true,
    });

    await writeFile(
        join(remoteClone, "skills", "remote-skill", "SKILL.md"),
        "body",
    );
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
    await rm(remoteClone, { force: true, recursive: true });
});

describe("syncSymlinkCapabilityStage, a remote source removed between syncs", () => {
    it("removes the symlink a now-unconfigured remote source previously created", async () => {
        const agent = new Agent(agentOptions);
        const targetDir = join(cwd, ".test/skills");

        const withRemote = new SyncPayload({
            capabilities: [AgentCapability.Skills],
            context: context,
            remoteSources: [
                {
                    name: "team",
                    rootDir: remoteClone,
                    selection: {
                        commands: [],
                        guidelines: false,
                        mcp: [],
                        skills: ["remote-skill"],
                    },
                    url: "git@example.com:x/y.git",
                },
            ],
            selectedAgents: [agent],
        });

        await syncSymlinkCapabilityStage(AgentCapability.Skills, withRemote);

        expect(await readdir(targetDir)).toEqual(["remote-skill"]);

        const withoutRemote = new SyncPayload({
            capabilities: [AgentCapability.Skills],
            context: context,
            selectedAgents: [agent],
        });

        await syncSymlinkCapabilityStage(AgentCapability.Skills, withoutRemote);

        expect(await readdir(targetDir)).toEqual([]);
    });
});
