import { describe, expect, it } from "vitest";
import { agentDefinitions } from "@agents/registry.js";

describe("agentDefinitions", () => {
    it("has a unique name for every agent", () => {
        const names = agentDefinitions.map((agent) => agent.name);

        expect(new Set(names).size).toBe(names.length);
    });

    it("has a non-empty displayName for every agent", () => {
        for (const agent of agentDefinitions) {
            expect(agent.displayName.length).toBeGreaterThan(0);
        }
    });

    it("defines both configPath and an entryFormats map whenever mcp is declared", () => {
        for (const agent of agentDefinitions) {
            if (!agent.mcp) {
                continue;
            }

            const configPath =
                typeof agent.mcp.configPath === "function"
                    ? agent.mcp.configPath("darwin")
                    : agent.mcp.configPath;

            expect(configPath.length).toBeGreaterThan(0);

            for (const kind of ["remote", "stdio"] as const) {
                expect(typeof agent.mcp.entryMappers[kind]).toBe("function");
            }
        }
    });

    it("returns a working systemDetection/projectDetection config for every platform", () => {
        for (const agent of agentDefinitions) {
            for (const platform of ["darwin", "win32", "linux"] as const) {
                expect(() =>
                    agent.detectSystemPathUsing(platform),
                ).not.toThrow();
            }

            expect(() => agent.detectProjectPathUsing()).not.toThrow();
        }
    });
});
