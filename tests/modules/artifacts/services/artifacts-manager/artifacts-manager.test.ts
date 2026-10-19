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
import { guidelinesSuffix } from "@artifacts/services/artifacts-manager/stubs/guidelines-suffix.js";
import filesystem from "@infrastructure/filesystem.js";
import Agent, { type AgentOptions } from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";
import type { McpServerMappers } from "@agents/types/mcp-server-mapper.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import { SyncStatus } from "@artifacts/enums/sync-status.js";
import { SyncPayload } from "@artifacts/data-transfer-objects/sync-payload.js";
import type { ResolvedRemoteSource } from "@artifacts/data-transfer-objects/sync-payload.js";
import saveRemoteClonePathAction from "@agents/actions/save-remote-clone-path-action.js";
import discoverRemoteCapabilitiesAction from "@artifacts/actions/discover-remote-capabilities-action.js";
import saveRemoteSourcesFileAction from "@artifacts/actions/save-remote-sources-file-action.js";
import { CliError } from "@support/errors/cli-error.js";

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

    it("resolves every capability and reports what would happen, without writing anything, in a dry run", async () => {
        await mkdir(join(cwd, ".ai/commands"), { recursive: true });
        await writeFile(join(cwd, ".ai/commands/example.md"), "hello");

        await mkdir(join(cwd, ".ai/skills/example"), { recursive: true });
        await writeFile(join(cwd, ".ai/skills/example/SKILL.md"), "hello");

        await mkdir(join(cwd, ".ai/mcp/example"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/mcp/example/config.json"),
            JSON.stringify({
                config: { command: "npx" },
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
            context: { cwd: cwd, isDryRun: true, sourceDir: ".ai" },
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

        expect(await filesystem.exists(join(cwd, ".mcp.json"))).toBe(false);
        expect(await filesystem.exists(join(cwd, "TEST.md"))).toBe(false);
        expect(await filesystem.exists(join(cwd, ".test/commands"))).toBe(
            false,
        );

        expect(await filesystem.exists(join(cwd, ".test/skills"))).toBe(false);

        expect(await filesystem.exists(join(cwd, ".gitignore"))).toBe(false);
    });

    it("reports an mcp entry that would be removed, without actually removing it, in a dry run", async () => {
        await mkdir(join(cwd, ".ai/mcp/example"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/mcp/example/config.json"),
            JSON.stringify({
                config: { command: "npx" },
                type: "stdio",
            }),
        );

        await artifactsManager.sync({
            capabilities: [AgentCapability.Mcp],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [testAgent],
        });

        await rm(join(cwd, ".ai/mcp/example"), { recursive: true });

        const outcome = await artifactsManager.sync({
            capabilities: [AgentCapability.Mcp],
            context: { cwd: cwd, isDryRun: true, sourceDir: ".ai" },
            selectedAgents: [testAgent],
        });

        expect(
            outcome.results.find((result) => result.item === "example"),
        ).toMatchObject({ status: SyncStatus.Removed });

        expect(
            JSON.parse(await readFile(join(cwd, ".mcp.json"), "utf8"))
                .mcpServers.example,
        ).toBeDefined();
    });

    it("marks an agent with no mcp support as unsupported for each discovered entry", async () => {
        await mkdir(join(cwd, ".ai/mcp/example"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/mcp/example/config.json"),
            JSON.stringify({
                config: { command: "npx" },
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
                type: "stdio",
            }),
        );

        await mkdir(join(cwd, ".ai/mcp/second"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/mcp/second/config.json"),
            JSON.stringify({
                config: { command: "npx" },
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

        // One read merges both entries, the other hashes the written file for the sync manifest.
        expect(mcpReads).toHaveLength(2);

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

    it("still reports written and gitignores an mcp entry that already matched and needed no write", async () => {
        spawnSync("git", ["init", "--quiet"], { cwd: cwd });
        spawnSync("git", ["config", "user.email", "test@example.com"], {
            cwd: cwd,
        });

        spawnSync("git", ["config", "user.name", "Test"], { cwd: cwd });

        await writeFile(
            join(cwd, ".mcp.json"),
            JSON.stringify({
                mcpServers: { example: { args: [], command: "npx" } },
            }),
        );

        spawnSync("git", ["add", ".mcp.json"], { cwd: cwd });

        await mkdir(join(cwd, ".ai/mcp/example"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/mcp/example/config.json"),
            JSON.stringify({
                config: { command: "npx" },
                type: "stdio",
            }),
        );

        const outcome = await artifactsManager.sync({
            capabilities: [AgentCapability.Mcp],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [testAgent],
        });

        expect(outcome.results[0].status).toBe(SyncStatus.Written);
        expect(outcome.gitignoreAlerts).toEqual([".mcp.json"]);
        expect(await readFile(join(cwd, ".gitignore"), "utf8")).toContain(
            ".mcp.json",
        );
    });

    it("re-syncs an mcp entry whose canonical config changed since it was last written", async () => {
        await mkdir(join(cwd, ".ai/mcp/example"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/mcp/example/config.json"),
            JSON.stringify({
                config: { command: "npx" },
                type: "stdio",
            }),
        );

        await artifactsManager.sync({
            capabilities: [AgentCapability.Mcp],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [testAgent],
        });

        await writeFile(
            join(cwd, ".ai/mcp/example/config.json"),
            JSON.stringify({
                config: { args: ["--verbose"], command: "npx" },
                type: "stdio",
            }),
        );

        const outcome = await artifactsManager.sync({
            capabilities: [AgentCapability.Mcp],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [testAgent],
        });

        expect(outcome.results[0].status).toBe(SyncStatus.Written);
        expect(
            JSON.parse(await readFile(join(cwd, ".mcp.json"), "utf8"))
                .mcpServers.example,
        ).toEqual({ args: ["--verbose"], command: "npx" });
    });

    it("removes an mcp entry whose canonical config no longer exists", async () => {
        await mkdir(join(cwd, ".ai/mcp/example"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/mcp/example/config.json"),
            JSON.stringify({
                config: { command: "npx" },
                type: "stdio",
            }),
        );

        await artifactsManager.sync({
            capabilities: [AgentCapability.Mcp],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [testAgent],
        });

        expect(
            JSON.parse(await readFile(join(cwd, ".mcp.json"), "utf8"))
                .mcpServers.example,
        ).toBeDefined();

        await rm(join(cwd, ".ai/mcp/example"), { recursive: true });

        const outcome = await artifactsManager.sync({
            capabilities: [AgentCapability.Mcp],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [testAgent],
        });

        expect(
            outcome.results.find((result) => result.item === "example"),
        ).toMatchObject({ status: SyncStatus.Removed });

        expect(
            JSON.parse(await readFile(join(cwd, ".mcp.json"), "utf8"))
                .mcpServers.example,
        ).toBeUndefined();
    });

    it("removes an mcp entry it never wrote, e.g. one a user added by hand, agenteq owns the whole map", async () => {
        await writeFile(
            join(cwd, ".mcp.json"),
            JSON.stringify({
                mcpServers: { "hand-added": { command: "something-else" } },
            }),
        );

        const outcome = await artifactsManager.sync({
            capabilities: [AgentCapability.Mcp],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [testAgent],
        });

        expect(outcome.results).toEqual([
            {
                agent: "Test Agent",
                capability: AgentCapability.Mcp,
                item: "hand-added",
                status: SyncStatus.Removed,
            },
        ]);

        expect(
            JSON.parse(await readFile(join(cwd, ".mcp.json"), "utf8"))
                .mcpServers["hand-added"],
        ).toBeUndefined();
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

    it("folds an existing Laravel Boost installation's guidelines into every synced agent", async () => {
        await writeFile(
            join(cwd, "boost.json"),
            JSON.stringify({ agents: ["claude_code"] }),
        );

        await writeFile(
            join(cwd, "CLAUDE.md"),
            "Some hand-written note.\n\n<laravel-boost-guidelines>\nUse Pest for tests.\n</laravel-boost-guidelines>\n",
        );

        await mkdir(join(cwd, ".ai"), { recursive: true });
        await writeFile(join(cwd, ".ai/GUIDELINES.md"), "# Hello\n");

        const outcome = await artifactsManager.sync({
            capabilities: [AgentCapability.Guidelines],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [testAgent],
        });

        expect(outcome.hasFailed).toBe(false);

        const guidelines = await readFile(join(cwd, "TEST.md"), "utf8");

        expect(guidelines).toContain("# Hello");
        expect(guidelines).toContain(
            "<laravel-boost-guidelines>\nUse Pest for tests.\n\n</laravel-boost-guidelines>",
        );

        const gitignore = await readFile(join(cwd, ".gitignore"), "utf8");

        expect(gitignore).toContain("CLAUDE.md");
    });

    it("gitignores, but never reads or mirrors, skills Laravel Boost already generated", async () => {
        await writeFile(
            join(cwd, "boost.json"),
            JSON.stringify({ agents: ["claude_code"] }),
        );

        await mkdir(join(cwd, ".claude/skills/boost-skill"), {
            recursive: true,
        });

        await writeFile(
            join(cwd, ".claude/skills/boost-skill/SKILL.md"),
            "boost skill content",
        );

        const outcome = await artifactsManager.sync({
            capabilities: [AgentCapability.Skills],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [testAgent],
        });

        expect(outcome.hasFailed).toBe(false);

        expect(
            await filesystem.exists(join(cwd, ".test/skills/boost-skill")),
        ).toBe(false);

        const gitignore = await readFile(join(cwd, ".gitignore"), "utf8");

        expect(gitignore).toContain(".claude/skills");
    });
});

describe("syncMcpAction with a remote source", () => {
    let cwd: string;
    let remoteRoot: string;

    const mcpAgent = new Agent({
        ...baseAgentOptions,
        mcp: createMcpConfiguration({
            configPath: ".mcp.json",
            entryMappers: {
                remote: (server) => ({ url: server.url }),
                stdio: (server) => ({
                    args: server.args ?? [],
                    command: server.command,
                }),
            },
        }),
    });

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), "agenteq-mcp-remote-"));
        remoteRoot = await mkdtemp(join(tmpdir(), "agenteq-remote-root-"));

        await mkdir(join(cwd, ".ai/mcp/local-only"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/mcp/local-only/config.json"),
            JSON.stringify({
                config: { command: "local" },
                type: "stdio",
            }),
        );

        await mkdir(join(cwd, ".ai/mcp/shared"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/mcp/shared/config.json"),
            JSON.stringify({
                config: { command: "local-shared" },
                type: "stdio",
            }),
        );

        await mkdir(join(remoteRoot, "mcp/shared"), { recursive: true });
        await writeFile(
            join(remoteRoot, "mcp/shared/config.json"),
            JSON.stringify({
                config: { command: "remote-shared" },
                type: "stdio",
            }),
        );

        await mkdir(join(remoteRoot, "mcp/remote-only"), { recursive: true });
        await writeFile(
            join(remoteRoot, "mcp/remote-only/config.json"),
            JSON.stringify({
                config: { command: "remote" },
                type: "stdio",
            }),
        );
    });

    afterEach(async () => {
        await rm(cwd, { force: true, recursive: true });
        await rm(remoteRoot, { force: true, recursive: true });
    });

    it("merges local and selected remote mcp servers, local winning a same-key collision", async () => {
        await saveRemoteSourcesFileAction({
            context: { cwd: cwd, sourceDir: ".ai" },
            remotes: {
                team: {
                    selection: {
                        commands: [],
                        guidelines: false,
                        mcp: ["shared", "remote-only"],
                        references: [],
                        skills: [],
                    },
                    url: "git@example.com",
                },
            },
            shouldIgnore: false,
        });

        await saveRemoteClonePathAction({
            context: { cwd: cwd, sourceDir: ".ai" },
            name: "team",
            path: remoteRoot,
        });

        const outcome = await artifactsManager.sync({
            capabilities: [AgentCapability.Mcp],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [mcpAgent],
        });

        expect(outcome.hasFailed).toBe(false);

        const written = JSON.parse(
            await readFile(join(cwd, ".mcp.json"), "utf8"),
        );

        expect(Object.keys(written.mcpServers).sort()).toEqual([
            "local-only",
            "remote-only",
            "shared",
        ]);

        expect(written.mcpServers.shared.command).toBe("local-shared");
    });

    it("never installs a remote mcp server that was not selected", async () => {
        await saveRemoteSourcesFileAction({
            context: { cwd: cwd, sourceDir: ".ai" },
            remotes: {
                team: {
                    selection: {
                        commands: [],
                        guidelines: false,
                        mcp: [],
                        references: [],
                        skills: [],
                    },
                    url: "git@example.com",
                },
            },
            shouldIgnore: false,
        });

        await saveRemoteClonePathAction({
            context: { cwd: cwd, sourceDir: ".ai" },
            name: "team",
            path: remoteRoot,
        });

        await artifactsManager.sync({
            capabilities: [AgentCapability.Mcp],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [mcpAgent],
        });

        const written = JSON.parse(
            await readFile(join(cwd, ".mcp.json"), "utf8"),
        );

        expect(Object.keys(written.mcpServers).sort()).toEqual([
            "local-only",
            "shared",
        ]);
    });

    it("installs a namespaced mcp server nested under a classified sub-folder", async () => {
        await mkdir(join(remoteRoot, "backend/mcp/backend-shared-server"), {
            recursive: true,
        });

        await writeFile(
            join(remoteRoot, "backend/mcp/backend-shared-server/config.json"),
            JSON.stringify({
                config: { command: "backend-remote" },
                type: "stdio",
            }),
        );

        await saveRemoteSourcesFileAction({
            context: { cwd: cwd, sourceDir: ".ai" },
            remotes: {
                team: {
                    selection: {
                        commands: [],
                        guidelines: false,
                        mcp: ["backend::backend-shared-server"],
                        references: [],
                        skills: [],
                    },
                    url: "git@example.com",
                },
            },
            shouldIgnore: false,
        });

        await saveRemoteClonePathAction({
            context: { cwd: cwd, sourceDir: ".ai" },
            name: "team",
            path: remoteRoot,
        });

        await artifactsManager.sync({
            capabilities: [AgentCapability.Mcp],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [mcpAgent],
        });

        const written = JSON.parse(
            await readFile(join(cwd, ".mcp.json"), "utf8"),
        );

        expect(Object.keys(written.mcpServers).sort()).toEqual([
            "backend-shared-server",
            "local-only",
            "shared",
        ]);

        expect(written.mcpServers["backend-shared-server"].command).toBe(
            "backend-remote",
        );
    });

    it("installs every mcp server in a namespace, including one never individually selected, when wildcarded", async () => {
        await mkdir(join(remoteRoot, "backend/mcp/backend-shared-server"), {
            recursive: true,
        });

        await writeFile(
            join(remoteRoot, "backend/mcp/backend-shared-server/config.json"),
            JSON.stringify({
                config: { command: "backend-remote" },
                type: "stdio",
            }),
        );

        await mkdir(join(remoteRoot, "backend/mcp/backend-other-server"), {
            recursive: true,
        });

        await writeFile(
            join(remoteRoot, "backend/mcp/backend-other-server/config.json"),
            JSON.stringify({
                config: { command: "backend-other-remote" },
                type: "stdio",
            }),
        );

        await saveRemoteSourcesFileAction({
            context: { cwd: cwd, sourceDir: ".ai" },
            remotes: {
                team: {
                    selection: {
                        commands: [],
                        guidelines: false,
                        mcp: ["backend::*"],
                        references: [],
                        skills: [],
                    },
                    url: "git@example.com",
                },
            },
            shouldIgnore: false,
        });

        await saveRemoteClonePathAction({
            context: { cwd: cwd, sourceDir: ".ai" },
            name: "team",
            path: remoteRoot,
        });

        await artifactsManager.sync({
            capabilities: [AgentCapability.Mcp],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [mcpAgent],
        });

        const written = JSON.parse(
            await readFile(join(cwd, ".mcp.json"), "utf8"),
        );

        expect(Object.keys(written.mcpServers).sort()).toEqual([
            "backend-other-server",
            "backend-shared-server",
            "local-only",
            "shared",
        ]);
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
            `# Hello\n${guidelinesSuffix({ remoteUrls: [] })}`,
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

describe("syncGuidelinesAction with a remote source", () => {
    let cwd: string;
    let remoteRoot: string;

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), "agenteq-guidelines-remote-"));
        remoteRoot = await mkdtemp(join(tmpdir(), "agenteq-remote-root-"));

        await mkdir(join(cwd, ".ai"), { recursive: true });
        await writeFile(join(cwd, ".ai", "GUIDELINES.md"), "# Local\n");
        await writeFile(join(remoteRoot, "GUIDELINES.md"), "# Remote\n");
    });

    afterEach(async () => {
        await rm(cwd, { force: true, recursive: true });
        await rm(remoteRoot, { force: true, recursive: true });
    });

    function payloadFor(
        agent: Agent,
        remoteSources: ResolvedRemoteSource[],
    ): SyncPayload {
        return new SyncPayload({
            capabilities: [AgentCapability.Guidelines],
            context: { cwd: cwd, sourceDir: ".ai" },
            remoteSources: remoteSources,
            selectedAgents: [agent],
        });
    }

    it("prepends the remote guidelines before the local ones when selected", async () => {
        const agent = new Agent({
            ...baseAgentOptions,
            guidelinesPath: "CLAUDE.md",
        });

        await syncGuidelinesStage(
            payloadFor(agent, [
                {
                    name: "team",
                    rootDir: remoteRoot,
                    selection: {
                        commands: [],
                        guidelines: true,
                        mcp: [],
                        references: [],
                        skills: [],
                    },
                    url: "git@example.com/team.git",
                },
            ]),
        );

        const content = await readFile(join(cwd, "CLAUDE.md"), "utf8");

        expect(content.indexOf("# Remote")).toBeLessThan(
            content.indexOf("# Local"),
        );

        expect(content).toContain("git@example.com/team.git");
    });

    it("never mixes in the remote guidelines when they were not selected", async () => {
        const agent = new Agent({
            ...baseAgentOptions,
            guidelinesPath: "CLAUDE.md",
        });

        await syncGuidelinesStage(
            payloadFor(agent, [
                {
                    name: "team",
                    rootDir: remoteRoot,
                    selection: {
                        commands: [],
                        guidelines: false,
                        mcp: [],
                        references: [],
                        skills: [],
                    },
                    url: "git@example.com/team.git",
                },
            ]),
        );

        const content = await readFile(join(cwd, "CLAUDE.md"), "utf8");

        expect(content).not.toContain("# Remote");
    });

    it("prepends every remote's guidelines, in configured order, before the local ones", async () => {
        const secondRemoteRoot = await mkdtemp(
            join(tmpdir(), "agenteq-guidelines-remote2-"),
        );

        await writeFile(
            join(secondRemoteRoot, "GUIDELINES.md"),
            "# Second remote\n",
        );

        const agent = new Agent({
            ...baseAgentOptions,
            guidelinesPath: "CLAUDE.md",
        });

        await syncGuidelinesStage(
            payloadFor(agent, [
                {
                    name: "first",
                    rootDir: remoteRoot,
                    selection: {
                        commands: [],
                        guidelines: true,
                        mcp: [],
                        references: [],
                        skills: [],
                    },
                    url: "git@example.com/first.git",
                },
                {
                    name: "second",
                    rootDir: secondRemoteRoot,
                    selection: {
                        commands: [],
                        guidelines: true,
                        mcp: [],
                        references: [],
                        skills: [],
                    },
                    url: "git@example.com/second.git",
                },
            ]),
        );

        const content = await readFile(join(cwd, "CLAUDE.md"), "utf8");

        expect(content.indexOf("# Remote")).toBeLessThan(
            content.indexOf("# Second remote"),
        );

        expect(content.indexOf("# Second remote")).toBeLessThan(
            content.indexOf("# Local"),
        );

        expect(content).toContain("git@example.com/first.git");
        expect(content).toContain("git@example.com/second.git");

        await rm(secondRemoteRoot, { force: true, recursive: true });
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

describe("syncSymlinkCapabilityAction with a remote source", () => {
    let cwd: string;
    let remoteRoot: string;

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), "agenteq-symlink-remote-"));
        remoteRoot = await mkdtemp(join(tmpdir(), "agenteq-remote-root-"));

        await mkdir(join(cwd, ".ai/commands"), { recursive: true });
        await writeFile(join(cwd, ".ai/commands/local.md"), "local");

        await mkdir(join(remoteRoot, "commands"), { recursive: true });
        await writeFile(join(remoteRoot, "commands/shared.md"), "shared");
        await writeFile(join(remoteRoot, "commands/local.md"), "remote copy");
    });

    afterEach(async () => {
        await rm(cwd, { force: true, recursive: true });
        await rm(remoteRoot, { force: true, recursive: true });
    });

    function payloadFor(
        agent: Agent,
        remoteSources: ResolvedRemoteSource[],
    ): SyncPayload {
        return new SyncPayload({
            capabilities: [AgentCapability.Commands],
            context: { cwd: cwd, sourceDir: ".ai" },
            remoteSources: remoteSources,
            selectedAgents: [agent],
        });
    }

    it("mirrors selected remote items alongside local ones", async () => {
        const agent = new Agent({
            ...baseAgentOptions,
            commandsDir: ".test/commands",
        });

        const result = await syncSymlinkCapabilityStage(
            AgentCapability.Commands,
            payloadFor(agent, [
                {
                    name: "team",
                    rootDir: remoteRoot,
                    selection: {
                        commands: ["shared.md", "local.md"],
                        guidelines: false,
                        mcp: [],
                        references: [],
                        skills: [],
                    },
                    url: "git@example.com",
                },
            ]),
        );

        expect(result.results[0].item).toBe("2 file(s)");

        const target = join(cwd, ".test/commands");

        expect(await readFile(join(target, "local.md"), "utf8")).toBe("local");
        expect(await readFile(join(target, "shared.md"), "utf8")).toBe(
            "shared",
        );
    });

    it("never mirrors a remote item that was not selected", async () => {
        const agent = new Agent({
            ...baseAgentOptions,
            commandsDir: ".test/commands",
        });

        const result = await syncSymlinkCapabilityStage(
            AgentCapability.Commands,
            payloadFor(agent, [
                {
                    name: "team",
                    rootDir: remoteRoot,
                    selection: {
                        commands: [],
                        guidelines: false,
                        mcp: [],
                        references: [],
                        skills: [],
                    },
                    url: "git@example.com",
                },
            ]),
        );

        expect(result.results[0].item).toBe("1 file(s)");
        expect(
            await filesystem.exists(join(cwd, ".test/commands/shared.md")),
        ).toBe(false);
    });

    it("lets a local item win a same-name collision against the remote source", async () => {
        const agent = new Agent({
            ...baseAgentOptions,
            commandsDir: ".test/commands",
        });

        await syncSymlinkCapabilityStage(
            AgentCapability.Commands,
            payloadFor(agent, [
                {
                    name: "team",
                    rootDir: remoteRoot,
                    selection: {
                        commands: ["shared.md", "local.md"],
                        guidelines: false,
                        mcp: [],
                        references: [],
                        skills: [],
                    },
                    url: "git@example.com",
                },
            ]),
        );

        expect(
            await readFile(join(cwd, ".test/commands/local.md"), "utf8"),
        ).toBe("local");
    });

    it("lets the first remote win a same-name collision against a later remote", async () => {
        const secondRemoteRoot = await mkdtemp(
            join(tmpdir(), "agenteq-remote-root2-"),
        );

        await mkdir(join(secondRemoteRoot, "commands"), { recursive: true });
        await writeFile(
            join(secondRemoteRoot, "commands/shared.md"),
            "second remote copy",
        );

        const agent = new Agent({
            ...baseAgentOptions,
            commandsDir: ".test/commands",
        });

        await syncSymlinkCapabilityStage(
            AgentCapability.Commands,
            payloadFor(agent, [
                {
                    name: "first",
                    rootDir: remoteRoot,
                    selection: {
                        commands: ["shared.md"],
                        guidelines: false,
                        mcp: [],
                        references: [],
                        skills: [],
                    },
                    url: "git@example.com/first",
                },
                {
                    name: "second",
                    rootDir: secondRemoteRoot,
                    selection: {
                        commands: ["shared.md"],
                        guidelines: false,
                        mcp: [],
                        references: [],
                        skills: [],
                    },
                    url: "git@example.com/second",
                },
            ]),
        );

        expect(
            await readFile(join(cwd, ".test/commands/shared.md"), "utf8"),
        ).toBe("shared");

        await rm(secondRemoteRoot, { force: true, recursive: true });
    });

    it("mirrors a namespaced item from a classified sub-folder, flattened at the target", async () => {
        await mkdir(join(remoteRoot, "backend/commands"), {
            recursive: true,
        });

        await writeFile(
            join(remoteRoot, "backend/commands/nested.md"),
            "nested",
        );

        const agent = new Agent({
            ...baseAgentOptions,
            commandsDir: ".test/commands",
        });

        const result = await syncSymlinkCapabilityStage(
            AgentCapability.Commands,
            payloadFor(agent, [
                {
                    name: "team",
                    rootDir: remoteRoot,
                    selection: {
                        commands: ["shared.md", "backend::nested.md"],
                        guidelines: false,
                        mcp: [],
                        references: [],
                        skills: [],
                    },
                    url: "git@example.com",
                },
            ]),
        );

        expect(result.results[0].item).toBe("3 file(s)");

        expect(
            await readFile(join(cwd, ".test/commands/nested.md"), "utf8"),
        ).toBe("nested");
    });

    it("lets a root item win a same-name collision against a namespaced one", async () => {
        await mkdir(join(remoteRoot, "backend/commands"), {
            recursive: true,
        });

        await writeFile(
            join(remoteRoot, "backend/commands/shared.md"),
            "backend copy",
        );

        const agent = new Agent({
            ...baseAgentOptions,
            commandsDir: ".test/commands",
        });

        await syncSymlinkCapabilityStage(
            AgentCapability.Commands,
            payloadFor(agent, [
                {
                    name: "team",
                    rootDir: remoteRoot,
                    selection: {
                        commands: ["shared.md", "backend::shared.md"],
                        guidelines: false,
                        mcp: [],
                        references: [],
                        skills: [],
                    },
                    url: "git@example.com",
                },
            ]),
        );

        expect(
            await readFile(join(cwd, ".test/commands/shared.md"), "utf8"),
        ).toBe("shared");
    });

    it("resolves a shared-namespace item as root, end to end from discovery through sync", async () => {
        await mkdir(join(remoteRoot, ".shared/commands"), {
            recursive: true,
        });

        await writeFile(
            join(remoteRoot, ".shared/commands/foo.md"),
            "foo body",
        );

        await mkdir(join(remoteRoot, "backend/commands"), {
            recursive: true,
        });

        await writeFile(
            join(remoteRoot, "backend/commands/bar.md"),
            "bar body",
        );

        const discovered = await discoverRemoteCapabilitiesAction({
            rootDir: remoteRoot,
        });

        // A shared-namespace item discovers as a bare root identifier, same as a plain root one.
        expect(discovered.commands.sort()).toEqual([
            "backend::bar.md",
            "foo.md",
            "local.md",
            "shared.md",
        ]);

        const agent = new Agent({
            ...baseAgentOptions,
            commandsDir: ".test/commands",
        });

        await syncSymlinkCapabilityStage(
            AgentCapability.Commands,
            payloadFor(agent, [
                {
                    name: "team",
                    rootDir: remoteRoot,
                    selection: {
                        commands: discovered.commands,
                        guidelines: false,
                        mcp: [],
                        references: [],
                        skills: [],
                    },
                    url: "git@example.com",
                },
            ]),
        );

        const target = join(cwd, ".test/commands");

        expect(await readFile(join(target, "foo.md"), "utf8")).toBe("foo body");

        expect(await readFile(join(target, "bar.md"), "utf8")).toBe("bar body");
    });

    it("mirrors every item in a namespace, including one never individually selected, when wildcarded", async () => {
        await mkdir(join(remoteRoot, "backend/commands"), {
            recursive: true,
        });

        await writeFile(join(remoteRoot, "backend/commands/known.md"), "known");

        await writeFile(
            join(remoteRoot, "backend/commands/unlisted.md"),
            "unlisted",
        );

        const agent = new Agent({
            ...baseAgentOptions,
            commandsDir: ".test/commands",
        });

        const result = await syncSymlinkCapabilityStage(
            AgentCapability.Commands,
            payloadFor(agent, [
                {
                    name: "team",
                    rootDir: remoteRoot,
                    selection: {
                        commands: ["backend::*"],
                        guidelines: false,
                        mcp: [],
                        references: [],
                        skills: [],
                    },
                    url: "git@example.com",
                },
            ]),
        );

        expect(result.results[0].item).toBe("3 file(s)");

        const target = join(cwd, ".test/commands");

        expect(await readFile(join(target, "known.md"), "utf8")).toBe("known");

        expect(await readFile(join(target, "unlisted.md"), "utf8")).toBe(
            "unlisted",
        );
    });
});

describe("artifactsManager.sync hand-edit protection", () => {
    let cwd: string;

    const agent = new Agent({
        ...baseAgentOptions,
        guidelinesPath: "CLAUDE.md",
    });

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), "agenteq-hand-edit-"));
        await mkdir(join(cwd, ".ai"), { recursive: true });
        await writeFile(join(cwd, ".ai/GUIDELINES.md"), "# Hello\n");
    });

    afterEach(async () => {
        await rm(cwd, { force: true, recursive: true });
    });

    function syncOnce() {
        return artifactsManager.sync({
            capabilities: [AgentCapability.Guidelines],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [agent],
        });
    }

    it("succeeds on a second sync when nothing was edited by hand", async () => {
        await syncOnce();

        await writeFile(join(cwd, ".ai/GUIDELINES.md"), "# Updated\n");

        const outcome = await syncOnce();

        expect(outcome.hasFailed).toBe(false);
        expect(await readFile(join(cwd, "CLAUDE.md"), "utf8")).toContain(
            "# Updated",
        );
    });

    it("stops before overwriting a file edited by hand since the last sync", async () => {
        await syncOnce();

        await writeFile(join(cwd, "CLAUDE.md"), "hand-edited content");

        await expect(syncOnce()).rejects.toThrow(CliError);

        // The hand edit survives, sync never got to the write.
        expect(await readFile(join(cwd, "CLAUDE.md"), "utf8")).toBe(
            "hand-edited content",
        );
    });

    it("lists every hand-edited path in the thrown error", async () => {
        await syncOnce();

        await writeFile(join(cwd, "CLAUDE.md"), "hand-edited content");

        await expect(syncOnce()).rejects.toThrow(/CLAUDE\.md/);
    });

    it("overwrites a hand-edited file anyway when shouldForce is set", async () => {
        await syncOnce();

        await writeFile(join(cwd, "CLAUDE.md"), "hand-edited content");

        const outcome = await artifactsManager.sync({
            capabilities: [AgentCapability.Guidelines],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [agent],
            shouldForce: true,
        });

        expect(outcome.hasFailed).toBe(false);
        expect(await readFile(join(cwd, "CLAUDE.md"), "utf8")).toContain(
            "# Hello",
        );
    });

    it("never blocks the very first sync, with no manifest saved yet", async () => {
        await writeFile(join(cwd, "CLAUDE.md"), "pre-existing hand content");

        const outcome = await syncOnce();

        expect(outcome.hasFailed).toBe(false);
    });
});
