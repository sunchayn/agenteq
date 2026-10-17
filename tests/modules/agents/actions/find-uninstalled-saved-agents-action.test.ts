import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import type { RunContext } from "@shared/types/run-context.js";

const installedAgent = new Agent({
    detectProjectPathUsing: () => createDetectionConfiguration({}),
    detectSystemPathUsing: () =>
        createDetectionConfiguration({ command: "node" }),
    displayName: "Installed Agent",
    name: "installed_agent",
});

const uninstalledAgent = new Agent({
    detectProjectPathUsing: () => createDetectionConfiguration({}),
    detectSystemPathUsing: () =>
        createDetectionConfiguration({
            command: "definitely-not-a-real-binary-xyz",
        }),
    displayName: "Uninstalled Agent",
    name: "uninstalled_agent",
});

vi.mock("@agents/registry.js", () => ({
    agentDefinitions: [installedAgent, uninstalledAgent],
}));

const { default: findUninstalledSavedAgentsAction } =
    await import("@agents/actions/find-uninstalled-saved-agents-action.js");

const { default: saveAgentsFileAction } =
    await import("@agents/actions/save-agents-file-action.js");

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-find-uninstalled-agents-"));
    context = { cwd: cwd, sourceDir: ".ai" };
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("findUninstalledSavedAgentsAction", () => {
    it("returns no findings when nothing was saved yet", async () => {
        expect(
            await findUninstalledSavedAgentsAction({ context: context }),
        ).toEqual([]);
    });

    it("returns no findings when every saved agent is still installed", async () => {
        await saveAgentsFileAction({
            agentNames: ["installed_agent"],
            capabilities: Object.values(AgentCapability),
            context: context,
        });

        expect(
            await findUninstalledSavedAgentsAction({ context: context }),
        ).toEqual([]);
    });

    it("reports a saved agent that is no longer installed, with the fix command", async () => {
        await saveAgentsFileAction({
            agentNames: ["uninstalled_agent"],
            capabilities: Object.values(AgentCapability),
            context: context,
        });

        const findings = await findUninstalledSavedAgentsAction({
            context: context,
        });

        expect(findings).toHaveLength(1);
        expect(findings[0]?.message).toContain("Uninstalled Agent");
        expect(findings[0]?.fixCommand).toBe("agenteq init");
    });
});
