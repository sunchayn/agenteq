import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import type { RunContext } from "@shared/types/run-context.js";

const testAgent = new Agent({
    commandsDir: ".agent/commands",
    detectProjectPathUsing: () => createDetectionConfiguration({}),
    detectSystemPathUsing: () => createDetectionConfiguration({}),
    displayName: "Test Agent",
    name: "test_agent",
    skillsDir: ".agent/skills",
});

vi.mock("@agents/registry.js", () => ({ agentDefinitions: [testAgent] }));

const { default: findBrokenSymlinksAction } =
    await import("@artifacts/actions/find-broken-symlinks-action.js");

const { default: saveAgentsFileAction } =
    await import("@agents/actions/save-agents-file-action.js");

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-find-broken-symlinks-"));
    context = { cwd: cwd, sourceDir: ".ai" };

    await saveAgentsFileAction({
        agentNames: ["test_agent"],
        capabilities: Object.values(AgentCapability),
        context: context,
    });
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("findBrokenSymlinksAction", () => {
    it("returns no findings for a saved agent with no capability directories on disk", async () => {
        expect(await findBrokenSymlinksAction({ context: context })).toEqual(
            [],
        );
    });

    it("returns no findings when every symlink still resolves", async () => {
        const commandsDir = join(cwd, ".agent", "commands");

        await mkdir(commandsDir, { recursive: true });
        await writeFile(join(cwd, "real-command.md"), "hello");
        await symlink(
            join(cwd, "real-command.md"),
            join(commandsDir, "real-command.md"),
        );

        expect(await findBrokenSymlinksAction({ context: context })).toEqual(
            [],
        );
    });

    it("reports a symlink that no longer resolves, with the fix command", async () => {
        const skillsDir = join(cwd, ".agent", "skills");

        await mkdir(skillsDir, { recursive: true });
        await symlink(
            join(cwd, "removed-skill"),
            join(skillsDir, "broken-skill"),
        );

        const findings = await findBrokenSymlinksAction({ context: context });

        expect(findings).toHaveLength(1);
        expect(findings[0]?.message).toContain("Test Agent");
        expect(findings[0]?.message).toContain(
            join(".agent", "skills", "broken-skill"),
        );

        expect(findings[0]?.fixCommand).toBe("agenteq sync");
    });
});
