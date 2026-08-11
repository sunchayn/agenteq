import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import claudeCode from "@agents/definitions/claude-code.js";
import saveAgentsFileAction from "@agents/actions/save-agents-file-action.js";
import AgentsFile from "@agents/entities/agents-file.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import output from "@infrastructure/terminal/output.js";
import type { RunContext } from "@shared/types/run-context.js";
import { CliError } from "@support/errors/cli-error.js";
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

const { registerInitCommand } = await import("@console/commands/init.js");

let originalCwd: string;
let cwd: string;
let context: RunContext;

function program(): Command {
    return createProgram(registerInitCommand);
}

beforeEach(async () => {
    originalCwd = process.cwd();
    cwd = await mkdtemp(join(tmpdir(), "agenteq-init-command-"));
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

describe("agenteq init: explicit --agents", () => {
    it("persists an explicit --agents selection", async () => {
        detectAgentsMock.mockResolvedValue([]);

        await program().parseAsync([
            "node",
            "agenteq",
            "init",
            "--agents",
            "claude_code",
            "--json",
        ]);

        expect(await readAgentsFile(context)).toEqual(["claude_code"]);

        expect(process.exitCode).toBeFalsy();
    });

    it("throws a trackable CliError for an unknown --agents value", async () => {
        await expect(
            program().parseAsync([
                "node",
                "agenteq",
                "init",
                "--agents",
                "bogus",
                "--json",
            ]),
        ).rejects.toThrow(CliError);
    });
});

describe("agenteq init: interactive re-prompt", () => {
    it("always prompts even when a valid agents file already exists, preselecting the union", async () => {
        await saveAgentsFileAction({
            agentNames: ["cursor"],
            capabilities: Object.values(AgentCapability),
            context: context,
        });

        detectAgentsMock.mockResolvedValue(detected([claudeCode, true]));
        multiselectMock.mockResolvedValue(["claude_code"]);

        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);

        await program().parseAsync(["node", "agenteq", "init"]);
        writeSpy.mockRestore();

        expect(multiselectMock).toHaveBeenCalledWith(
            expect.objectContaining({
                initialValues: expect.arrayContaining([
                    "claude_code",
                    "cursor",
                ]),
            }),
        );

        expect(await readAgentsFile(context)).toEqual(["claude_code"]);

        expect(process.exitCode).toBeFalsy();
    });

    it("filters out a picked name the registry does not recognize", async () => {
        detectAgentsMock.mockResolvedValue(detected([claudeCode, false]));
        multiselectMock.mockResolvedValue(["claude_code", "not-a-real-agent"]);

        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);

        await program().parseAsync(["node", "agenteq", "init"]);
        writeSpy.mockRestore();

        expect(await readAgentsFile(context)).toEqual(["claude_code"]);

        expect(process.exitCode).toBeFalsy();
    });

    it("tolerates a malformed existing agents file as an advisory preselect", async () => {
        await mkdir(join(cwd, ".ai"), { recursive: true });
        await writeFile(AgentsFile.path(context), "not json", "utf8");
        detectAgentsMock.mockResolvedValue(detected([claudeCode, false]));
        multiselectMock.mockResolvedValue(["claude_code"]);

        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);

        await program().parseAsync(["node", "agenteq", "init"]);
        writeSpy.mockRestore();

        expect(await readAgentsFile(context)).toEqual(["claude_code"]);

        expect(process.exitCode).toBeFalsy();
    });

    it("cancelling the prompt sets exitCode 1 and leaves the agents file untouched", async () => {
        await saveAgentsFileAction({
            agentNames: ["cursor"],
            capabilities: Object.values(AgentCapability),
            context: context,
        });

        detectAgentsMock.mockResolvedValue(detected([claudeCode, false]));
        multiselectMock.mockResolvedValue("CANCELLED");

        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);

        await program().parseAsync(["node", "agenteq", "init"]);
        writeSpy.mockRestore();

        expect(process.exitCode).toBe(1);
        expect(await readAgentsFile(context)).toEqual(["cursor"]);
    });

    it("still prompts when only --json is passed, and prints valid JSON afterward", async () => {
        detectAgentsMock.mockResolvedValue(detected([claudeCode, false]));
        multiselectMock.mockResolvedValue(["claude_code"]);

        const outputSpy = vi
            .spyOn(output, "writeRaw")
            .mockImplementation(() => undefined);

        await program().parseAsync(["node", "agenteq", "init", "--json"]);

        expect(multiselectMock).toHaveBeenCalled();

        const written = outputSpy.mock.calls.map(([text]) => text).join("");

        outputSpy.mockRestore();

        expect(() => {
            JSON.parse(written);
        }).not.toThrow();

        expect(await readAgentsFile(context)).toEqual(["claude_code"]);
        expect(process.exitCode).toBeFalsy();
    });
});

describe("agenteq init: non-interactive fallback", () => {
    it("reuses an existing agents file without re-persisting or prompting", async () => {
        await saveAgentsFileAction({
            agentNames: ["cursor"],
            capabilities: Object.values(AgentCapability),
            context: context,
        });

        await program().parseAsync([
            "node",
            "agenteq",
            "init",
            "--yes",
            "--json",
        ]);

        expect(multiselectMock).not.toHaveBeenCalled();
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
            "init",
            "--yes",
            "--json",
        ]);

        expect(detectAgentsMock).toHaveBeenCalled();
        expect(await readAgentsFile(context)).toEqual(["claude_code"]);
        expect(process.exitCode).toBeFalsy();
    });

    it("silently saves auto-detected agents when no agents file exists", async () => {
        detectAgentsMock.mockResolvedValue(detected([claudeCode, true]));

        await program().parseAsync([
            "node",
            "agenteq",
            "init",
            "--yes",
            "--json",
        ]);

        expect(await readAgentsFile(context)).toEqual(["claude_code"]);

        expect(process.exitCode).toBeFalsy();
    });

    it("sets exitCode 1 when nothing is detected and nothing was specified", async () => {
        detectAgentsMock.mockResolvedValue(detected([claudeCode, false]));

        const outputSpy = vi
            .spyOn(output, "writeRaw")
            .mockImplementation(() => undefined);

        await program().parseAsync([
            "node",
            "agenteq",
            "init",
            "--yes",
            "--json",
        ]);

        expect(multiselectMock).not.toHaveBeenCalled();

        const written = outputSpy.mock.calls.map(([text]) => text).join("");

        expect(written).toContain("--agents");

        expect(process.exitCode).toBe(1);

        outputSpy.mockRestore();
    });
});
