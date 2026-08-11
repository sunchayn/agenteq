import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveCapabilitiesToSync } from "@console/utils/artifacts.js";
import saveAgentsFileAction from "@agents/actions/save-agents-file-action.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import { CliError } from "@support/errors/cli-error.js";
import type { RunContext } from "@shared/types/run-context.js";

describe("resolveCapabilities", () => {
    let cwd: string;
    let context: RunContext;

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), "agenteq-resolve-capabilities-"));
        context = { cwd: cwd, sourceDir: ".ai" };
    });

    afterEach(async () => {
        await rm(cwd, { force: true, recursive: true });
    });

    describe("--only wins", () => {
        it("uses --only over a saved agents file, marking the result dirty", async () => {
            await saveAgentsFileAction({
                agentNames: ["claude_code"],
                capabilities: [AgentCapability.Guidelines],
                context: context,
            });

            const result = await resolveCapabilitiesToSync({
                context: context,
                only: "mcp",
            });

            expect(result).toEqual({
                capabilities: [AgentCapability.Mcp],
                isDirty: true,
            });
        });

        it("accepts a comma-separated subset of capabilities", async () => {
            const result = await resolveCapabilitiesToSync({
                context: context,
                only: "mcp,guidelines",
            });

            expect(result).toEqual({
                capabilities: [AgentCapability.Mcp, AgentCapability.Guidelines],
                isDirty: true,
            });
        });

        it("throws a trackable CliError for an unknown capability", async () => {
            await expect(
                resolveCapabilitiesToSync({
                    context: context,
                    only: "mcp,bogus",
                }),
            ).rejects.toThrow(CliError);

            try {
                await resolveCapabilitiesToSync({
                    context: context,
                    only: "mcp,bogus",
                });
            } catch (error) {
                expect((error as CliError).code).toBe("E_UNKNOWN_CAPABILITY");
            }
        });
    });

    describe("saved agents file", () => {
        it("falls back to the saved file's capabilities, marking the result clean", async () => {
            await saveAgentsFileAction({
                agentNames: ["claude_code"],
                capabilities: [AgentCapability.Skills],
                context: context,
            });

            const result = await resolveCapabilitiesToSync({
                context: context,
                only: undefined,
            });

            expect(result).toEqual({
                capabilities: [AgentCapability.Skills],
                isDirty: false,
            });
        });
    });

    describe("nothing saved", () => {
        it("defaults to every capability, marking the result dirty", async () => {
            const result = await resolveCapabilitiesToSync({
                context: context,
                only: undefined,
            });

            expect(result).toEqual({
                capabilities: Object.values(AgentCapability),
                isDirty: true,
            });
        });
    });
});
