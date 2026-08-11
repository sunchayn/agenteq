import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";
import { AgentStatus } from "@agents/data-transfer-objects/agent-status.js";
import output from "@infrastructure/terminal/output.js";

const { detectAgentsMock } = vi.hoisted(() => ({ detectAgentsMock: vi.fn() }));

vi.mock("@agents/actions/detect-agents-action.js", () => ({
    default: detectAgentsMock,
}));

const { registerDetectCommand } = await import("@console/commands/detect.js");

function agent(name: string, withMcp: boolean): Agent {
    return new Agent({
        detectProjectPathUsing: () => createDetectionConfiguration({}),
        detectSystemPathUsing: () => createDetectionConfiguration({}),
        displayName: name,
        name: name,
        ...(withMcp && {
            mcp: createMcpConfiguration({
                configPath: "x.json",
                entryMappers: {
                    remote: () => ({}),
                    stdio: () => ({}),
                },
            }),
        }),
    });
}

function readJsonStdout(writeSpy: ReturnType<typeof vi.spyOn>): unknown {
    const written = writeSpy.mock.calls
        .map(([chunk]: [unknown]) => String(chunk))
        .join("");

    return JSON.parse(written);
}

function program(): Command {
    const program = new Command();

    program.exitOverride();
    registerDetectCommand(program);

    return program;
}

beforeEach(() => {
    detectAgentsMock.mockReset();
});

describe("agenteq detect --json", () => {
    it("reports each agent's install status and capabilities", async () => {
        const detected = [
            new AgentStatus({
                agent: agent("with_mcp", true),
                isProjectInstalled: false,
                isSystemInstalled: true,
            }),
            new AgentStatus({
                agent: agent("no_mcp", false),
                isProjectInstalled: false,
                isSystemInstalled: false,
            }),
        ];

        detectAgentsMock.mockResolvedValue(detected);

        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);

        await program().parseAsync(["node", "agenteq", "detect", "--json"]);

        const payload = readJsonStdout(writeSpy) as {
            name: string;
            systemInstalled: boolean;
            capabilities: string[];
        }[];

        writeSpy.mockRestore();

        expect(payload).toEqual([
            {
                capabilities: ["mcp"],
                displayName: "with_mcp",
                name: "with_mcp",
                projectInstalled: false,
                systemInstalled: true,
            },
            {
                capabilities: [],
                displayName: "no_mcp",
                name: "no_mcp",
                projectInstalled: false,
                systemInstalled: false,
            },
        ]);
    });

    it("exits 0 when at least one agent is detected", async () => {
        detectAgentsMock.mockResolvedValue([
            new AgentStatus({
                agent: agent("found", false),
                isProjectInstalled: false,
                isSystemInstalled: true,
            }),
        ]);

        vi.spyOn(process.stdout, "write").mockImplementation(() => true);

        const cmd = program();

        await cmd.parseAsync(["node", "agenteq", "detect", "--json"]);

        expect(process.exitCode).toBe(0);
        process.exitCode = 0;
        vi.restoreAllMocks();
    });

    it("exits 1 when nothing is detected", async () => {
        detectAgentsMock.mockResolvedValue([
            new AgentStatus({
                agent: agent("missing", false),
                isProjectInstalled: false,
                isSystemInstalled: false,
            }),
        ]);

        vi.spyOn(process.stdout, "write").mockImplementation(() => true);

        const cmd = program();

        await cmd.parseAsync(["node", "agenteq", "detect", "--json"]);

        expect(process.exitCode).toBe(1);
        process.exitCode = 0;
        vi.restoreAllMocks();
    });
});

describe("agenteq detect (table output)", () => {
    it("renders a table row with every capability and install status", async () => {
        const fullAgent = new Agent({
            commandsDir: "commands",
            detectProjectPathUsing: () => createDetectionConfiguration({}),
            detectSystemPathUsing: () => createDetectionConfiguration({}),
            displayName: "Full Agent",
            guidelinesPath: "GUIDELINES.md",
            mcp: createMcpConfiguration({
                configPath: "x.json",
                entryMappers: {
                    remote: () => ({}),
                    stdio: () => ({}),
                },
            }),
            name: "full_agent",
            skillsDir: "skills",
        });

        detectAgentsMock.mockResolvedValue([
            new AgentStatus({
                agent: fullAgent,
                isProjectInstalled: true,
                isSystemInstalled: false,
            }),
            new AgentStatus({
                agent: agent("no_caps", false),
                isProjectInstalled: false,
                isSystemInstalled: false,
            }),
        ]);

        const tableSpy = vi
            .spyOn(output, "table")
            .mockImplementation(() => undefined);

        await program().parseAsync(["node", "agenteq", "detect"]);

        expect(tableSpy).toHaveBeenCalledWith(
            ["Agent", "Name", "System", "Project", "Capabilities"],
            [
                [
                    "Full Agent",
                    "full_agent",
                    "no",
                    "yes",
                    "guidelines, skills, mcp, commands",
                ],
                ["no_caps", "no_caps", "no", "no", "-"],
            ],
        );

        tableSpy.mockRestore();
    });
});
