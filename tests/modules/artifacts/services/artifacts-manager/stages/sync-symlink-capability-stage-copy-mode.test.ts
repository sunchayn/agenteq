import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import artifactsManager from "@artifacts/services/artifacts-manager/index.js";
import filesystem from "@infrastructure/filesystem.js";
import Agent, { type AgentOptions } from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import type { RunContext } from "@shared/types/run-context.js";

const agentOptions: AgentOptions = {
    detectProjectPathUsing: () => createDetectionConfiguration({}),
    detectSystemPathUsing: () => createDetectionConfiguration({}),
    displayName: "Test Agent",
    name: "test_agent",
    skillsDir: ".test/skills",
};

const agent = new Agent(agentOptions);

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-copy-mode-test-"));
    context = { cwd: cwd, sourceDir: ".ai" };

    await mkdir(join(cwd, ".ai/skills/alpha"), { recursive: true });
    await writeFile(join(cwd, ".ai/skills/alpha/SKILL.md"), "alpha body");
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("syncSymlinkCapabilityStage, copy mode", () => {
    it("writes a real file copy instead of a symlink", async () => {
        await artifactsManager.sync({
            capabilities: [AgentCapability.Skills],
            context: context,
            isCopyMode: true,
            selectedAgents: [agent],
        });

        const target = join(cwd, ".test/skills/alpha/SKILL.md");

        expect((await lstat(target)).isSymbolicLink()).toBe(false);
        expect(await readFile(target, "utf8")).toBe("alpha body");
    });

    it("symlinks as usual when copy mode is off", async () => {
        await artifactsManager.sync({
            capabilities: [AgentCapability.Skills],
            context: context,
            selectedAgents: [agent],
        });

        const target = join(cwd, ".test/skills/alpha/SKILL.md");

        expect((await lstat(target)).isSymbolicLink()).toBe(true);
    });

    it("removes a copy whose source no longer exists on the next sync", async () => {
        await mkdir(join(cwd, ".ai/skills/beta"), { recursive: true });
        await writeFile(join(cwd, ".ai/skills/beta/SKILL.md"), "beta body");

        await artifactsManager.sync({
            capabilities: [AgentCapability.Skills],
            context: context,
            isCopyMode: true,
            selectedAgents: [agent],
        });

        expect(
            await filesystem.exists(join(cwd, ".test/skills/beta/SKILL.md")),
        ).toBe(true);

        await rm(join(cwd, ".ai/skills/beta"), { recursive: true });

        await artifactsManager.sync({
            capabilities: [AgentCapability.Skills],
            context: context,
            isCopyMode: true,
            selectedAgents: [agent],
        });

        expect(
            await filesystem.exists(join(cwd, ".test/skills/beta/SKILL.md")),
        ).toBe(false);

        // The still-selected skill is untouched by the removal of the other one.
        expect(
            await filesystem.exists(join(cwd, ".test/skills/alpha/SKILL.md")),
        ).toBe(true);
    });

    it("converts a copy to a symlink once copy mode is turned off", async () => {
        await artifactsManager.sync({
            capabilities: [AgentCapability.Skills],
            context: context,
            isCopyMode: true,
            selectedAgents: [agent],
        });

        const target = join(cwd, ".test/skills/alpha/SKILL.md");

        expect((await lstat(target)).isSymbolicLink()).toBe(false);

        await artifactsManager.sync({
            capabilities: [AgentCapability.Skills],
            context: context,
            selectedAgents: [agent],
        });

        expect((await lstat(target)).isSymbolicLink()).toBe(true);
    });

    it("leaves a copy untouched when a later sync requests an unrelated capability", async () => {
        await artifactsManager.sync({
            capabilities: [AgentCapability.Skills],
            context: context,
            isCopyMode: true,
            selectedAgents: [agent],
        });

        const target = join(cwd, ".test/skills/alpha/SKILL.md");

        expect(await filesystem.exists(target)).toBe(true);

        // A sync scoped to an unrelated capability, e.g. `agenteq sync --only mcp`,
        // never requests Skills, so it must never reconcile or remove its copies.
        await artifactsManager.sync({
            capabilities: [AgentCapability.Mcp],
            context: context,
            isCopyMode: true,
            selectedAgents: [agent],
        });

        expect(await filesystem.exists(target)).toBe(true);
        expect(await readFile(target, "utf8")).toBe("alpha body");
    });

    it("never removes a file it did not copy itself", async () => {
        await mkdir(join(cwd, ".test/skills/hand-made"), { recursive: true });
        await writeFile(
            join(cwd, ".test/skills/hand-made/SKILL.md"),
            "written by the user",
        );

        await artifactsManager.sync({
            capabilities: [AgentCapability.Skills],
            context: context,
            isCopyMode: true,
            selectedAgents: [agent],
        });

        expect(
            await readFile(
                join(cwd, ".test/skills/hand-made/SKILL.md"),
                "utf8",
            ),
        ).toBe("written by the user");
    });
});
