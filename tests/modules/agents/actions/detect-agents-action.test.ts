import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";

const commandAgent = new Agent({
    detectProjectPathUsing: () => createDetectionConfiguration({}),
    detectSystemPathUsing: () =>
        createDetectionConfiguration({ command: "node" }),
    displayName: "Command Agent",
    name: "command_agent",
});

const missingCommandAgent = new Agent({
    detectProjectPathUsing: () => createDetectionConfiguration({}),
    detectSystemPathUsing: () =>
        createDetectionConfiguration({
            command: "definitely-not-a-real-binary-xyz",
        }),
    displayName: "Missing Command Agent",
    name: "missing_command_agent",
});

const commandArrayAgent = new Agent({
    detectProjectPathUsing: () => createDetectionConfiguration({}),
    detectSystemPathUsing: () =>
        createDetectionConfiguration({
            command: ["definitely-not-a-real-binary-xyz", "node"],
        }),
    displayName: "Command Array Agent",
    name: "command_array_agent",
});

const pathAgent = new Agent({
    detectProjectPathUsing: () =>
        createDetectionConfiguration({ paths: [".claude"] }),
    detectSystemPathUsing: () => createDetectionConfiguration({}),
    displayName: "Path Agent",
    name: "path_agent",
});

const globPathAgent = new Agent({
    detectProjectPathUsing: () =>
        createDetectionConfiguration({ paths: ["PhpStorm*"] }),
    detectSystemPathUsing: () => createDetectionConfiguration({}),
    displayName: "Glob Path Agent",
    name: "glob_path_agent",
});

const fileAgent = new Agent({
    detectProjectPathUsing: () =>
        createDetectionConfiguration({ files: ["CLAUDE.md"] }),
    detectSystemPathUsing: () => createDetectionConfiguration({}),
    displayName: "File Agent",
    name: "file_agent",
});

const registeredAgents = [
    commandAgent,
    missingCommandAgent,
    commandArrayAgent,
    pathAgent,
    globPathAgent,
    fileAgent,
];

vi.mock("../../../../src/modules/agents/registry.js", () => ({
    agentDefinitions: registeredAgents,
}));

const { default: detectAgentsAction } =
    await import("@agents/actions/detect-agents-action.js");

let cwd: string;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-detect-agents-"));
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("detectAgentsAction", () => {
    it("matches on an existing command", async () => {
        const results = await detectAgentsAction({ cwd: cwd });

        expect(
            results.find((r) => r.agent.name === "command_agent")
                ?.isSystemInstalled,
        ).toBe(true);
    });

    it("does not match a nonexistent command", async () => {
        const results = await detectAgentsAction({ cwd: cwd });

        expect(
            results.find((r) => r.agent.name === "missing_command_agent")
                ?.isSystemInstalled,
        ).toBe(false);
    });

    it("matches a command array if any candidate resolves", async () => {
        const results = await detectAgentsAction({ cwd: cwd });

        expect(
            results.find((r) => r.agent.name === "command_array_agent")
                ?.isSystemInstalled,
        ).toBe(true);
    });

    it("matches on an existing project path", async () => {
        await mkdir(join(cwd, ".claude"));

        const results = await detectAgentsAction({ cwd: cwd });

        expect(
            results.find((r) => r.agent.name === "path_agent")
                ?.isProjectInstalled,
        ).toBe(true);
    });

    it("matches a glob path against an existing directory", async () => {
        await mkdir(join(cwd, "PhpStorm-2024.1"));

        const results = await detectAgentsAction({ cwd: cwd });

        expect(
            results.find((r) => r.agent.name === "glob_path_agent")
                ?.isProjectInstalled,
        ).toBe(true);
    });

    it("matches on an existing project file", async () => {
        await writeFile(join(cwd, "CLAUDE.md"), "hello");

        const results = await detectAgentsAction({ cwd: cwd });

        expect(
            results.find((r) => r.agent.name === "file_agent")
                ?.isProjectInstalled,
        ).toBe(true);
    });

    it("returns false for project detection when nothing matches", async () => {
        const results = await detectAgentsAction({ cwd: cwd });

        expect(
            results.find((r) => r.agent.name === "path_agent")
                ?.isProjectInstalled,
        ).toBe(false);

        expect(
            results.find((r) => r.agent.name === "glob_path_agent")
                ?.isProjectInstalled,
        ).toBe(false);

        expect(
            results.find((r) => r.agent.name === "file_agent")
                ?.isProjectInstalled,
        ).toBe(false);
    });

    it("resolves project paths and files relative to the given cwd", async () => {
        await mkdir(join(cwd, ".claude"));

        const otherCwd = await mkdtemp(
            join(tmpdir(), "agenteq-detect-agents-other-"),
        );

        try {
            const results = await detectAgentsAction({ cwd: otherCwd });

            expect(
                results.find((r) => r.agent.name === "path_agent")
                    ?.isProjectInstalled,
            ).toBe(false);
        } finally {
            await rm(otherCwd, { force: true, recursive: true });
        }
    });
});
