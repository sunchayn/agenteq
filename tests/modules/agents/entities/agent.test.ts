import { describe, expect, it } from "vitest";
import Agent from "@agents/entities/agent.js";
import type { AgentOptions } from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";

function baseOptions(): AgentOptions {
    return {
        detectProjectPathUsing: () => createDetectionConfiguration({}),
        detectSystemPathUsing: () => createDetectionConfiguration({}),
        displayName: "Test Agent",
        name: "test_agent",
    };
}

describe("Agent#supportsMcp", () => {
    it("is false when no mcp capability was passed", () => {
        expect(new Agent(baseOptions()).supportsMcp()).toBe(false);
    });

    it("is true when an mcp capability was passed", () => {
        const agent = new Agent({
            ...baseOptions(),
            mcp: createMcpConfiguration({
                configPath: "x.json",
                entryMappers: {
                    remote: () => ({}),
                    stdio: () => ({}),
                },
            }),
        });

        expect(agent.supportsMcp()).toBe(true);
    });
});

describe("Agent#supportsCommands", () => {
    it("is false when no commands capability was passed", () => {
        expect(new Agent(baseOptions()).supportsCommands()).toBe(false);
    });

    it("is true when a commands capability was passed", () => {
        const agent = new Agent({
            ...baseOptions(),
            commandsDir: ".agent/commands",
        });

        expect(agent.supportsCommands()).toBe(true);
    });
});

describe("Agent#supportsSkills", () => {
    it("is false when no skills capability was passed", () => {
        expect(new Agent(baseOptions()).supportsSkills()).toBe(false);
    });

    it("is true when a skills capability was passed", () => {
        const agent = new Agent({
            ...baseOptions(),
            skillsDir: ".agent/skills",
        });

        expect(agent.supportsSkills()).toBe(true);
    });
});

describe("Agent#supportsGuidelines", () => {
    it("is false when no guidelines capability was passed", () => {
        expect(new Agent(baseOptions()).supportsGuidelines()).toBe(false);
    });

    it("is true when a guidelines capability was passed", () => {
        const agent = new Agent({
            ...baseOptions(),
            guidelinesPath: "AGENTS.md",
        });

        expect(agent.supportsGuidelines()).toBe(true);
    });
});
