import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import claudeCode from "@agents/definitions/claude-code.js";
import saveAgentsFileAction from "@agents/actions/save-agents-file-action.js";
import AgentsFile from "@agents/entities/agents-file.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import type { RunContext } from "@shared/types/run-context.js";
import { CliError } from "@support/errors/cli-error.js";
import output from "@infrastructure/terminal/output.js";
import * as syncArtifactsActionModule from "@console/actions/sync-artifacts-action.js";
import {
    createProgram,
    detected,
    readAgentsFile,
} from "./command-test-helpers.js";

const { detectAgentsMock } = vi.hoisted(() => ({ detectAgentsMock: vi.fn() }));

vi.mock("@agents/actions/detect-agents-action.js", () => ({
    default: detectAgentsMock,
}));

const { multiselectMock } = vi.hoisted(() => ({ multiselectMock: vi.fn() }));

vi.mock("@infrastructure/terminal/input.js", () => ({
    default: {
        isCancel: (value: unknown) => value === "CANCELLED",
        isInteractive: () => true,
        multiselect: multiselectMock,
    },
}));

const { registerSyncCommand } = await import("@console/commands/sync.js");

let originalCwd: string;
let cwd: string;
let context: RunContext;

function program(): Command {
    return createProgram(registerSyncCommand);
}

beforeEach(async () => {
    originalCwd = process.cwd();
    cwd = await mkdtemp(join(tmpdir(), "agenteq-sync-command-"));
    process.chdir(cwd);
    context = { cwd: cwd, sourceDir: ".ai" };
    detectAgentsMock.mockReset();
    multiselectMock.mockReset();
    process.exitCode = 0;
});

afterEach(async () => {
    process.chdir(originalCwd);
    await rm(cwd, { force: true, recursive: true });
});

describe("agenteq sync: explicit --agents", () => {
    it("resolves --agents to real agents and persists the override", async () => {
        detectAgentsMock.mockResolvedValue([]);

        await program().parseAsync([
            "node",
            "agenteq",
            "sync",
            "--agents",
            "claude_code,cursor",
            "--json",
        ]);

        expect(await readAgentsFile(context)).toEqual([
            "claude_code",
            "cursor",
        ]);

        expect(process.exitCode).toBeFalsy();
    });

    it("throws a trackable CliError for an unknown --agents value", async () => {
        await expect(
            program().parseAsync([
                "node",
                "agenteq",
                "sync",
                "--agents",
                "bogus",
                "--json",
            ]),
        ).rejects.toThrow(CliError);
    });
});

describe("agenteq sync: saved agents file is authoritative", () => {
    it("uses an existing agents file directly, without calling detectAgents", async () => {
        await saveAgentsFileAction({
            agentNames: ["cursor"],
            capabilities: Object.values(AgentCapability),
            context: context,
        });

        await program().parseAsync([
            "node",
            "agenteq",
            "sync",
            "--yes",
            "--json",
        ]);

        expect(detectAgentsMock).not.toHaveBeenCalled();
        expect(process.exitCode).toBeFalsy();
    });

    it("falls back to auto-detection and overwrites a malformed agents file", async () => {
        await saveAgentsFileAction({
            agentNames: ["cursor"],
            capabilities: Object.values(AgentCapability),
            context: context,
        });

        await writeFile(AgentsFile.path(context), "not json", "utf8");
        detectAgentsMock.mockResolvedValue(detected([claudeCode, true]));

        await program().parseAsync([
            "node",
            "agenteq",
            "sync",
            "--yes",
            "--json",
        ]);

        expect(detectAgentsMock).toHaveBeenCalled();
        expect(await readAgentsFile(context)).toEqual(["claude_code"]);
        expect(process.exitCode).toBeFalsy();
    });
});

describe("agenteq sync: auto-detection", () => {
    it("silently saves and syncs auto-detected agents when no agents file exists", async () => {
        detectAgentsMock.mockResolvedValue(detected([claudeCode, true]));

        await program().parseAsync([
            "node",
            "agenteq",
            "sync",
            "--yes",
            "--json",
        ]);

        expect(await readAgentsFile(context)).toEqual(["claude_code"]);

        expect(process.exitCode).toBeFalsy();
    });

    it("announces the saved agents on the non-json path", async () => {
        await saveAgentsFileAction({
            agentNames: ["cursor"],
            capabilities: Object.values(AgentCapability),
            context: context,
        });

        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);

        const infoSpy = vi.spyOn(output, "info");

        await program().parseAsync(["node", "agenteq", "sync", "--yes"]);

        writeSpy.mockRestore();

        expect(infoSpy).toHaveBeenCalledWith("Using saved agents: Cursor");
        infoSpy.mockRestore();
    });

    it("sets exitCode 1 when the saved agents file resolves to no agents", async () => {
        await saveAgentsFileAction({
            agentNames: [],
            capabilities: Object.values(AgentCapability),
            context: context,
        });

        const writeSpy = vi
            .spyOn(process.stderr, "write")
            .mockImplementation(() => true);

        await program().parseAsync([
            "node",
            "agenteq",
            "sync",
            "--yes",
            "--json",
        ]);

        writeSpy.mockRestore();

        expect(detectAgentsMock).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
    });

    it("sets exitCode 1 when nothing is detected and nothing was specified", async () => {
        detectAgentsMock.mockResolvedValue(detected([claudeCode, false]));

        const writeSpy = vi
            .spyOn(process.stderr, "write")
            .mockImplementation(() => true);

        await program().parseAsync([
            "node",
            "agenteq",
            "sync",
            "--yes",
            "--json",
        ]);

        writeSpy.mockRestore();

        expect(process.exitCode).toBe(1);
        expect(await readAgentsFile(context)).toBeUndefined();
    });

    it("switches into the prompt-and-save flow when a TTY is available", async () => {
        detectAgentsMock.mockResolvedValue(detected([claudeCode, false]));
        multiselectMock.mockResolvedValue(["claude_code"]);

        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);

        await program().parseAsync(["node", "agenteq", "sync"]);
        writeSpy.mockRestore();

        expect(await readAgentsFile(context)).toEqual(["claude_code"]);

        expect(process.exitCode).toBeFalsy();
    });

    it("cancelling the prompt sets exitCode 1 and leaves the agents file untouched", async () => {
        detectAgentsMock.mockResolvedValue(detected([claudeCode, false]));
        multiselectMock.mockResolvedValue("CANCELLED");

        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);

        await program().parseAsync(["node", "agenteq", "sync"]);
        writeSpy.mockRestore();

        expect(process.exitCode).toBe(1);
        expect(await readAgentsFile(context)).toBeUndefined();
    });

    it("sets exitCode 1 when the sync itself reports a failure", async () => {
        await saveAgentsFileAction({
            agentNames: ["claude_code"],
            capabilities: Object.values(AgentCapability),
            context: context,
        });

        const syncSpy = vi
            .spyOn(syncArtifactsActionModule, "default")
            .mockResolvedValue(true);

        await program().parseAsync([
            "node",
            "agenteq",
            "sync",
            "--yes",
            "--json",
        ]);

        syncSpy.mockRestore();

        expect(process.exitCode).toBe(1);
    });
});
