import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import saveAgentsFileAction from "@agents/actions/save-agents-file-action.js";
import AgentsFile from "@agents/entities/agents-file.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import type { RunContext } from "@shared/types/run-context.js";

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-save-agents-file-"));
    context = { cwd: cwd, sourceDir: ".ai" };
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("saveAgentsFileAction", () => {
    it("round-trips a saved agents file", async () => {
        await saveAgentsFileAction({
            agentNames: ["claude_code", "cursor"],
            capabilities: [AgentCapability.Mcp],
            context: context,
        });

        const raw = await readFile(AgentsFile.path(context), "utf8");

        expect(JSON.parse(raw).agents).toEqual(["claude_code", "cursor"]);
        expect(JSON.parse(raw).capabilities).toEqual(["mcp"]);
    });

    it("adds the file path to .gitignore on first write", async () => {
        await saveAgentsFileAction({
            agentNames: ["claude_code"],
            capabilities: [AgentCapability.Mcp],
            context: context,
        });

        const gitignore = await readFile(join(cwd, ".gitignore"), "utf8");

        expect(gitignore).toContain(".ai/agenteq.json");
    });

    it("does not touch .gitignore again on a subsequent write", async () => {
        await saveAgentsFileAction({
            agentNames: ["claude_code"],
            capabilities: [AgentCapability.Mcp],
            context: context,
        });

        const first = await readFile(join(cwd, ".gitignore"), "utf8");

        await saveAgentsFileAction({
            agentNames: ["cursor"],
            capabilities: [AgentCapability.Mcp],
            context: context,
        });

        const second = await readFile(join(cwd, ".gitignore"), "utf8");

        expect(second).toBe(first);
    });
});
