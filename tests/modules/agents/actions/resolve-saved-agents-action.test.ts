import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import resolveSavedAgentsAction from "@agents/actions/resolve-saved-agents-action.js";
import saveAgentsFileAction from "@agents/actions/save-agents-file-action.js";
import claudeCode from "@agents/definitions/claude-code.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import type { RunContext } from "@shared/types/run-context.js";

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-resolve-saved-agents-"));
    context = { cwd: cwd, sourceDir: ".ai" };
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("resolveSavedAgentsAction", () => {
    it("returns undefined when no saved agents file exists", async () => {
        expect(
            await resolveSavedAgentsAction({ context: context }),
        ).toBeUndefined();
    });

    it("resolves saved agent names to real Agent objects", async () => {
        await saveAgentsFileAction({
            agentNames: ["claude_code"],
            capabilities: Object.values(AgentCapability),
            context: context,
        });

        expect(await resolveSavedAgentsAction({ context: context })).toEqual([
            claudeCode,
        ]);
    });
});
