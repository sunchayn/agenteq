import { spawnSync } from "node:child_process";
import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import artifactsManager from "@artifacts/services/artifacts-manager/index.js";
import syncGuidelinesStage from "@artifacts/services/artifacts-manager/stages/sync-guidelines-stage.js";
import syncSymlinkCapabilityStage from "@artifacts/services/artifacts-manager/stages/sync-symlink-capability-stage.js";
import { GUIDELINES_SUFFIX } from "@artifacts/services/artifacts-manager/stubs/guidelines-suffix.js";
import filesystem from "@infrastructure/filesystem.js";
import Agent, { type AgentOptions } from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";
import type { McpServerMappers } from "@agents/types/mcp-server-mapper.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import { SyncStatus } from "@artifacts/enums/sync-status.js";
import { SyncPayload } from "@artifacts/data-transfer-objects/sync-payload.js";

const baseAgentOptions: AgentOptions = {
    detectProjectPathUsing: () => createDetectionConfiguration({}),
    detectSystemPathUsing: () => createDetectionConfiguration({}),
    displayName: "Test Agent",
    name: "test_agent",
};

describe("artifactsManager.sync", () => {
    let cwd: string;

    const testEntryMappers: McpServerMappers = {
        remote: (server) => ({ url: server.url }),
        stdio: (server) => ({
            args: server.args ?? [],
            command: server.command,
        }),
    };

    const testAgentOptions: AgentOptions = {
        ...baseAgentOptions,
        commandsDir: ".test/commands",
        guidelinesPath: "TEST.md",
        mcp: createMcpConfiguration({
            configPath: ".mcp.json",
            entryMappers: testEntryMappers,
        }),
        skillsDir: ".test/skills",
    };

    const testAgent = new Agent(testAgentOptions);

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), "agenteq-sync-pipeline-"));
    });

    afterEach(async () => {
        await rm(cwd, { force: true, recursive: true });
    });

    it("never touches the terminal, only the filesystem", async () => {
        await mkdir(join(cwd, ".ai/commands"), { recursive: true });
        await writeFile(join(cwd, ".ai/commands/example.md"), "hello");

        const stdoutSpy = vi.spyOn(process.stdout, "write");
        const stderrSpy = vi.spyOn(process.stderr, "write");

        await artifactsManager.sync({
            capabilities: [AgentCapability.Commands],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [testAgent],
        });

        expect(stdoutSpy).not.toHaveBeenCalled();
        expect(stderrSpy).not.toHaveBeenCalled();

        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
    });

    it("syncs every requested capability that has a canonical source", async () => {
        await mkdir(join(cwd, ".ai/commands"), { recursive: true });
        await writeFile(join(cwd, ".ai/commands/example.md"), "hello");

        await mkdir(join(cwd, ".ai/skills/example"), { recursive: true });
        await writeFile(join(cwd, ".ai/skills/example/SKILL.md"), "hello");

        await mkdir(join(cwd, ".ai/mcp/example"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/mcp/example/config.json"),
            JSON.stringify({
                config: { command: "npx" },
                key: "example",
                type: "stdio",
            }),
        );

        await writeFile(join(cwd, ".ai/GUIDELINES.md"), "# Hello\n");

        const outcome = await artifactsManager.sync({
            capabilities: [
                AgentCapability.Mcp,
                AgentCapability.Commands,
                AgentCapability.Skills,
                AgentCapability.Guidelines,
            ],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [testAgent],
        });

        expect(outcome.hasFailed).toBe(false);
        expect(
            outcome.results.map((r) => `${r.capability}:${r.status}`).sort(),
        ).toEqual([
            "commands:written",
            "guidelines:written",
            "mcp:written",
            "skills:written",
        ]);

        expect(await readFile(join(cwd, ".mcp.json"), "utf8")).toContain(
            "example",
        );

        expect(await readFile(join(cwd, ".gitignore"), "utf8")).toContain(
            ".mcp.json",
        );
    });

    it("marks an agent with no mcp support as unsupported for each discovered entry", async () => {
        await mkdir(join(cwd, ".ai/mcp/example"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/mcp/example/config.json"),
            JSON.stringify({
                config: { command: "npx" },
                key: "example",
                type: "stdio",
            }),
        );

        const unsupportedAgent = new Agent(baseAgentOptions);

        const outcome = await artifactsManager.sync({
            capabilities: [AgentCapability.Mcp],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [unsupportedAgent],
        });

        expect(outcome.results).toEqual([
            {
                agent: "Test Agent",
                capability: AgentCapability.Mcp,
                item: "example",
                status: SyncStatus.Unsupported,
            },
        ]);
    });

    it("merges multiple entries into the same file, reading it from disk only once", async () => {
        await mkdir(join(cwd, ".ai/mcp/first"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/mcp/first/config.json"),
            JSON.stringify({
                config: { command: "npx" },
                key: "first",
                type: "stdio",
            }),
        );

        await mkdir(join(cwd, ".ai/mcp/second"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/mcp/second/config.json"),
            JSON.stringify({
                config: { command: "npx" },
                key: "second",
                type: "stdio",
            }),
        );

        const readFileSpy = vi.spyOn(filesystem, "readFile");

        await artifactsManager.sync({
            capabilities: [AgentCapability.Mcp],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [testAgent],
        });

        const mcpReads = readFileSpy.mock.calls.filter(
            (call) => call[0] === join(cwd, ".mcp.json"),
        );

        expect(mcpReads).toHaveLength(1);

        const written = JSON.parse(
            await readFile(join(cwd, ".mcp.json"), "utf8"),
        );

        expect(Object.keys(written.mcpServers).sort()).toEqual([
            "first",
            "second",
        ]);

        readFileSpy.mockRestore();
    });

    it("resolves a platform-dependent mcp config path before writing", async () => {
        await mkdir(join(cwd, ".ai/mcp/example"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/mcp/example/config.json"),
            JSON.stringify({
                config: { command: "npx" },
                key: "example",
                type: "stdio",
            }),
        );

        const agentWithPlatformPath = new Agent({
            ...baseAgentOptions,
            mcp: createMcpConfiguration({
                configPath: () => "platform-config.json",
                entryMappers: testEntryMappers,
            }),
        });

        const outcome = await artifactsManager.sync({
            capabilities: [AgentCapability.Mcp],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [agentWithPlatformPath],
        });

        expect(outcome.results[0].status).toBe(SyncStatus.Written);
        expect(
            await readFile(join(cwd, "platform-config.json"), "utf8"),
        ).toContain("example");
    });

    it("only syncs the capabilities that were requested", async () => {
        await mkdir(join(cwd, ".ai/commands"), { recursive: true });
        await writeFile(join(cwd, ".ai/commands/example.md"), "hello");
        await writeFile(join(cwd, ".ai/GUIDELINES.md"), "# Hello\n");

        const outcome = await artifactsManager.sync({
            capabilities: [AgentCapability.Commands],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [testAgent],
        });

        expect(outcome.results.map((r) => r.capability)).toEqual(["commands"]);
    });

    it("reports no results when no canonical sources exist", async () => {
        const outcome = await artifactsManager.sync({
            capabilities: [
                AgentCapability.Mcp,
                AgentCapability.Commands,
                AgentCapability.Skills,
                AgentCapability.Guidelines,
            ],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [testAgent],
        });

        expect(outcome.hasFailed).toBe(false);
        expect(outcome.results).toEqual([]);
    });

    it("flags an mcp config file that was already committed before it got gitignored", async () => {
        spawnSync("git", ["init", "--quiet"], { cwd: cwd });
        spawnSync("git", ["config", "user.email", "test@example.com"], {
            cwd: cwd,
        });

        spawnSync("git", ["config", "user.name", "Test"], { cwd: cwd });

        await writeFile(join(cwd, ".mcp.json"), "{}");
        spawnSync("git", ["add", ".mcp.json"], { cwd: cwd });

        await mkdir(join(cwd, ".ai/mcp/example"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/mcp/example/config.json"),
            JSON.stringify({
                config: { command: "npx" },
                key: "example",
                type: "stdio",
            }),
        );

        const outcome = await artifactsManager.sync({
            capabilities: [AgentCapability.Mcp],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [testAgent],
        });

        expect(outcome.gitignoreAlerts).toEqual([".mcp.json"]);
    });

    it("still gitignores and flags an mcp config file whose entry already existed and needed no write", async () => {
        spawnSync("git", ["init", "--quiet"], { cwd: cwd });
        spawnSync("git", ["config", "user.email", "test@example.com"], {
            cwd: cwd,
        });

        spawnSync("git", ["config", "user.name", "Test"], { cwd: cwd });

        await writeFile(
            join(cwd, ".mcp.json"),
            JSON.stringify({ mcpServers: { example: { command: "npx" } } }),
        );

        spawnSync("git", ["add", ".mcp.json"], { cwd: cwd });

        await mkdir(join(cwd, ".ai/mcp/example"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/mcp/example/config.json"),
            JSON.stringify({
                config: { command: "npx" },
                key: "example",
                type: "stdio",
            }),
        );

        const outcome = await artifactsManager.sync({
            capabilities: [AgentCapability.Mcp],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [testAgent],
        });

        expect(outcome.results[0].status).toBe(SyncStatus.Skipped);
        expect(outcome.gitignoreAlerts).toEqual([".mcp.json"]);
        expect(await readFile(join(cwd, ".gitignore"), "utf8")).toContain(
            ".mcp.json",
        );
    });

    it("flags a guidelines file that was already committed before it got gitignored", async () => {
        spawnSync("git", ["init", "--quiet"], { cwd: cwd });
        spawnSync("git", ["config", "user.email", "test@example.com"], {
            cwd: cwd,
        });

        spawnSync("git", ["config", "user.name", "Test"], { cwd: cwd });

        await writeFile(join(cwd, "TEST.md"), "stale guidelines");
        spawnSync("git", ["add", "TEST.md"], { cwd: cwd });

        await mkdir(join(cwd, ".ai"), { recursive: true });
        await writeFile(join(cwd, ".ai/GUIDELINES.md"), "# Hello\n");

        const outcome = await artifactsManager.sync({
            capabilities: [AgentCapability.Guidelines],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [testAgent],
        });

        expect(outcome.gitignoreAlerts).toEqual(["TEST.md"]);
    });
});

describe("syncGuidelinesAction", () => {
    let cwd: string;

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), "agenteq-guidelines-action-"));
        await mkdir(join(cwd, ".ai"), { recursive: true });
        await writeFile(join(cwd, ".ai", "GUIDELINES.md"), "# Hello\n");
    });

    afterEach(async () => {
        await rm(cwd, { force: true, recursive: true });
    });

    function payloadFor(agent: Agent): SyncPayload {
        return new SyncPayload({
            capabilities: [AgentCapability.Guidelines],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [agent],
        });
    }

    it("writes a real file with the suffix appended", async () => {
        const agent = new Agent({
            ...baseAgentOptions,
            guidelinesPath: "CLAUDE.md",
        });

        const result = await syncGuidelinesStage(payloadFor(agent));

        expect(result.results.map((r) => r.status)).toEqual(["written"]);
        expect(result.artifactPaths).toEqual(["CLAUDE.md"]);

        const target = join(cwd, "CLAUDE.md");

        expect((await lstat(target)).isSymbolicLink()).toBe(false);
        expect(await readFile(target, "utf8")).toBe(
            `# Hello\n${GUIDELINES_SUFFIX}`,
        );

        expect(await readFile(join(cwd, ".gitignore"), "utf8")).toBe(
            "CLAUDE.md\n",
        );
    });

    it("marks an agent with no guidelines capability as unsupported", async () => {
        const agent = new Agent(baseAgentOptions);

        const result = await syncGuidelinesStage(payloadFor(agent));

        expect(result.results).toEqual([
            {
                agent: "Test Agent",
                capability: AgentCapability.Guidelines,
                item: "(not supported)",
                status: SyncStatus.Unsupported,
            },
        ]);
    });

    it("passes the payload through unchanged when the capability was not requested", async () => {
        const agent = new Agent({
            ...baseAgentOptions,
            guidelinesPath: "CLAUDE.md",
        });

        const payload = new SyncPayload({
            capabilities: [],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [agent],
        });

        const result = await syncGuidelinesStage(payload);

        expect(result.results).toEqual([]);
    });

    it("reports failed status and the caught error's message when filesystem write throws, and continues with other agents", async () => {
        const agent1 = new Agent({
            ...baseAgentOptions,
            guidelinesPath: "CLAUDE.md",
            name: "agent_1",
        });

        const agent2 = new Agent({
            ...baseAgentOptions,
            guidelinesPath: "OTHER.md",
            name: "agent_2",
        });

        const payload = new SyncPayload({
            capabilities: [AgentCapability.Guidelines],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [agent1, agent2],
        });

        const writeFileSpy = vi.spyOn(filesystem, "writeFile");

        let callCount = 0;

        writeFileSpy.mockImplementation(async () => {
            callCount++;

            if (callCount === 1) {
                throw new Error("Write failed");
            }
        });

        const result = await syncGuidelinesStage(payload);

        expect(result.results).toHaveLength(2);
        expect(result.results[0].status).toBe(SyncStatus.Failed);
        expect(result.results[0].detail).toBe("Write failed");
        expect(result.results[1].status).toBe(SyncStatus.Written);
        expect(result.artifactPaths).toEqual(["OTHER.md"]);

        writeFileSpy.mockRestore();
    });
});

describe("syncSymlinkCapabilityAction", () => {
    let cwd: string;

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), "agenteq-symlink-action-"));
        await mkdir(join(cwd, ".ai/commands/nested"), { recursive: true });
        await writeFile(join(cwd, ".ai/commands/a.md"), "hello");
        await writeFile(join(cwd, ".ai/commands/nested/b.md"), "world");
    });

    afterEach(async () => {
        await rm(cwd, { force: true, recursive: true });
    });

    function payloadFor(agent: Agent): SyncPayload {
        return new SyncPayload({
            capabilities: [AgentCapability.Commands],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [agent],
        });
    }

    it("symlinks every file from the source into the agent's dir, preserving structure", async () => {
        const agent = new Agent({
            ...baseAgentOptions,
            commandsDir: ".test/commands",
        });

        const result = await syncSymlinkCapabilityStage(
            AgentCapability.Commands,
            payloadFor(agent),
        );

        expect(
            result.results.map((r) => `${r.capability}:${r.status}`),
        ).toEqual(["commands:written"]);

        expect(result.artifactPaths).toEqual([".test/commands"]);

        const target = join(cwd, ".test/commands");

        expect(await readFile(join(target, "a.md"), "utf8")).toBe("hello");
        expect(await readFile(join(target, "nested", "b.md"), "utf8")).toBe(
            "world",
        );

        expect((await lstat(join(target, "a.md"))).isSymbolicLink()).toBe(true);

        expect(await readFile(join(cwd, ".gitignore"), "utf8")).toBe(
            ".test/commands\n",
        );
    });

    it("renames each command file's extension for an agent that declares commandsFileExtension", async () => {
        const agent = new Agent({
            ...baseAgentOptions,
            commandsDir: ".test/commands",
            commandsFileExtension: ".prompt.md",
        });

        await syncSymlinkCapabilityStage(
            AgentCapability.Commands,
            payloadFor(agent),
        );

        const target = join(cwd, ".test/commands");

        expect(await readFile(join(target, "a.prompt.md"), "utf8")).toBe(
            "hello",
        );

        expect(
            await readFile(join(target, "nested", "b.prompt.md"), "utf8"),
        ).toBe("world");
    });

    it("does not gitignore a dir capability whose source produced no files", async () => {
        const agent = new Agent({
            ...baseAgentOptions,
            commandsDir: ".test/commands",
        });

        await rm(join(cwd, ".ai/commands"), { force: true, recursive: true });
        await mkdir(join(cwd, ".ai/commands"), { recursive: true });

        await syncSymlinkCapabilityStage(
            AgentCapability.Commands,
            payloadFor(agent),
        );

        await expect(
            readFile(join(cwd, ".gitignore"), "utf8"),
        ).rejects.toThrow();
    });

    it("removes a stale symlink into the source on a second run, but keeps other files", async () => {
        const agent = new Agent({
            ...baseAgentOptions,
            commandsDir: ".test/commands",
        });

        const target = join(cwd, ".test/commands");

        await syncSymlinkCapabilityStage(
            AgentCapability.Commands,
            payloadFor(agent),
        );

        // Simulates a command that was renamed or deleted from the source since the last sync,
        // leaving behind a symlink that still points into it.
        await rm(join(target, "a.md"));
        await symlink(join(cwd, ".ai/commands/a.md"), join(target, "a.md"));
        await rm(join(cwd, ".ai/commands/a.md"));

        await writeFile(join(target, "kept.md"), "not agenteq's to remove");

        await syncSymlinkCapabilityStage(
            AgentCapability.Commands,
            payloadFor(agent),
        );

        await expect(readFile(join(target, "a.md"), "utf8")).rejects.toThrow();

        expect(await readFile(join(target, "kept.md"), "utf8")).toBe(
            "not agenteq's to remove",
        );

        expect(await readFile(join(target, "nested", "b.md"), "utf8")).toBe(
            "world",
        );
    });

    it("marks an agent with no capability for the capability being synced as unsupported", async () => {
        const agent = new Agent(baseAgentOptions);

        const result = await syncSymlinkCapabilityStage(
            AgentCapability.Commands,
            payloadFor(agent),
        );

        expect(result.results).toEqual([
            {
                agent: "Test Agent",
                capability: AgentCapability.Commands,
                item: "(not supported)",
                status: SyncStatus.Unsupported,
            },
        ]);
    });

    it("passes the payload through unchanged when the capability was not requested", async () => {
        const agent = new Agent({
            ...baseAgentOptions,
            skillsDir: ".test/skills",
        });

        const payload = new SyncPayload({
            capabilities: [AgentCapability.Commands],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [agent],
        });

        const result = await syncSymlinkCapabilityStage(
            AgentCapability.Skills,
            payload,
        );

        expect(result.results).toEqual([]);
    });

    it("reports failed status and the caught error's message when filesystem operation throws, and continues with other agents", async () => {
        const agent1 = new Agent({
            ...baseAgentOptions,
            commandsDir: ".test/commands",
            name: "agent_1",
        });

        const agent2 = new Agent({
            ...baseAgentOptions,
            commandsDir: ".test/commands2",
            name: "agent_2",
        });

        const payload = new SyncPayload({
            capabilities: [AgentCapability.Commands],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [agent1, agent2],
        });

        const globSpy = vi.spyOn(filesystem, "glob");

        let callCount = 0;

        globSpy.mockImplementation(async () => {
            callCount++;

            if (callCount === 1) {
                throw new Error("Glob failed");
            }

            return ["a.md", "nested/b.md"];
        });

        const result = await syncSymlinkCapabilityStage(
            AgentCapability.Commands,
            payload,
        );

        expect(result.results).toHaveLength(2);
        expect(result.results[0].status).toBe(SyncStatus.Failed);
        expect(result.results[0].item).toBe("failed");
        expect(result.results[0].detail).toBe("Glob failed");
        expect(result.results[1].status).toBe(SyncStatus.Written);
        expect(result.results[1].item).toBe("2 file(s)");
        expect(result.artifactPaths).toEqual([".test/commands2"]);

        globSpy.mockRestore();
    });
});
