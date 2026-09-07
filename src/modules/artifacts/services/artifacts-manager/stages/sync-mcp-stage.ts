import { dirname, relative, resolve } from "node:path";
import type Agent from "@agents/entities/agent.js";
import type { McpConfiguration } from "@agents/types/mcp-configuration.js";
import type { McpServer } from "@agents/entities/mcp-server.js";
import filesystem from "@infrastructure/filesystem.js";
import git from "@infrastructure/git.js";
import { expandPath } from "@support/utils/expand-path.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import { ConfigFileFormat } from "@artifacts/enums/config-file-format.js";
import { SyncStatus } from "@artifacts/enums/sync-status.js";
import discoverMcpServersAction from "@artifacts/actions/discover-mcp-servers-action.js";
import type { SyncResult } from "@artifacts/types/sync-result.js";
import { SyncPayload } from "@artifacts/data-transfer-objects/sync-payload.js";
import installMcpServerAction from "./mcp/actions/install-mcp-server-action.js";

/**
 * Discovers the canonical MCP servers, then installs each into every selected agent,
 * marking an agent with no MCP support as unsupported.
 */
export default async function syncMcpStage(
    payload: SyncPayload,
): Promise<SyncPayload> {
    if (!payload.wantsCapability(AgentCapability.Mcp)) {
        return payload;
    }

    const { artifactPaths, results } = await installMcpServers(payload);

    return payload.withResults(results, artifactPaths);
}

/*
 * Interface & Types.
 */

interface PendingInstall {
    server: McpServer;
    mcp: McpConfiguration;
    filePath: string;
    result: SyncResult;
}

/*
 * Internal.
 */

interface InstallMcpServersResult {
    results: SyncResult[];
    artifactPaths: string[];
}

async function installMcpServers(
    payload: SyncPayload,
): Promise<InstallMcpServersResult> {
    const { cwd } = payload.context;

    const servers = await discoverMcpServersAction({
        cwd: cwd,
        sourceDir: payload.context.sourceDir,
    });

    const { installsByFile, results } = collectPendingInstalls({
        cwd: cwd,
        selectedAgents: payload.selectedAgents,
        servers: servers,
    });

    const artifactPaths: string[] = [];

    for (const [filePath, installs] of installsByFile) {
        await processFile(filePath, installs);

        // Gitignore every resolved config path, even one left unwritten this run because its content already matched.
        const relPath = relative(cwd, filePath);

        await git.ignore({ cwd: cwd, relPath: relPath });
        artifactPaths.push(relPath);
    }

    return { artifactPaths: artifactPaths, results: results };
}

interface CollectPendingInstallsOptions {
    selectedAgents: Agent[];
    servers: McpServer[];
    cwd: string;
}

interface CollectPendingInstallsResult {
    installsByFile: Map<string, PendingInstall[]>;
    results: SyncResult[];
}

/**
 * Builds one result row per agent per server,
 * and groups the supported combinations into the pending installs destined for each target config file.
 */
function collectPendingInstalls(
    options: CollectPendingInstallsOptions,
): CollectPendingInstallsResult {
    const { cwd, selectedAgents, servers } = options;

    const installsByFile = new Map<string, PendingInstall[]>();
    const results: SyncResult[] = [];

    for (const agent of selectedAgents) {
        for (const server of servers) {
            const result: SyncResult = {
                agent: agent.displayName,
                capability: AgentCapability.Mcp,
                item: server.key,
                status: SyncStatus.Unsupported,
            };

            results.push(result);

            if (!agent.mcp) {
                continue;
            }

            const filePath = resolveConfigPath(agent.mcp, cwd);
            const installs = installsByFile.get(filePath) ?? [];

            installs.push({
                filePath: filePath,
                mcp: agent.mcp,
                result: result,
                server: server,
            });

            installsByFile.set(filePath, installs);
        }
    }

    return { installsByFile: installsByFile, results: results };
}

function resolveConfigPath(mcp: McpConfiguration, cwd: string): string {
    const configPath =
        typeof mcp.configPath === "function"
            ? mcp.configPath(process.platform)
            : mcp.configPath;

    return resolve(cwd, expandPath(configPath));
}

/**
 * Picks the config file format to parse and write based on its extension, defaulting to JSON.
 */
function detectFormat(filePath: string): ConfigFileFormat {
    if (filePath.endsWith(".toml")) {
        return ConfigFileFormat.Toml;
    }

    if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
        return ConfigFileFormat.Yaml;
    }

    return ConfigFileFormat.Json;
}

/**
 * Reads one file once, applies every pending install destined for it in order, and writes it back only if any of them changed it.
 */
async function processFile(
    filePath: string,
    installs: PendingInstall[],
): Promise<boolean> {
    const format = detectFormat(filePath);
    const originalText = (await filesystem.readFile(filePath)) ?? "";

    let text = originalText;

    for (const pending of installs) {
        const installed = installMcpServerAction({
            format: format,
            mcp: pending.mcp,
            server: pending.server,
            text: text,
        });

        // Mutates the same object already stored in the stage's results list,
        // so the status lands there without a separate write-back step.
        pending.result.status = installed.status;
        text = installed.text;
    }

    if (text === originalText) {
        return false;
    }

    await filesystem.mkdir(dirname(filePath));
    await filesystem.writeFile({ content: text, path: filePath });

    return true;
}
