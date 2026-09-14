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
import reconcileMcpServersAction from "./mcp/actions/reconcile-mcp-servers-action.js";

/**
 * Discovers the canonical MCP servers, local plus a remote source's selected entries.
 * Reconciles each selected agent's config file against that set, marking one with no MCP support as unsupported.
 * Every server no longer in the set is removed from the file, agenteq owns the whole servers map,
 * whether it put a stale entry there itself or not.
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

interface FileWork {
    mcp: McpConfiguration;
    agentDisplayNames: string[];
    servers: McpServer[];
}

interface InstallMcpServersResult {
    results: SyncResult[];
    artifactPaths: string[];
}

interface CollectFileWorkOptions {
    selectedAgents: Agent[];
    servers: McpServer[];
    cwd: string;
}

interface CollectFileWorkResult {
    workByFile: Map<string, FileWork>;
    results: SyncResult[];
}

/*
 * Internal.
 */

/**
 * Discovers local mcp servers, then every remote source's selected entries, in order.
 * Local wins a same-key collision, then the first remote to claim a key wins.
 */
async function collectMcpServers(payload: SyncPayload): Promise<McpServer[]> {
    const { cwd, sourceDir } = payload.context;

    const localServers = await discoverMcpServersAction({
        cwd: cwd,
        sourceDir: sourceDir,
    });

    const servers = [...localServers];
    const claimedKeys = new Set(localServers.map((server) => server.key));

    for (const remote of payload.remoteSources) {
        const remoteServers = await discoverMcpServersAction({
            cwd: remote.rootDir,
            sourceDir: ".",
        });

        for (const server of remoteServers) {
            if (
                !remote.selection.mcp.includes(server.key) ||
                claimedKeys.has(server.key)
            ) {
                continue;
            }

            servers.push(server);
            claimedKeys.add(server.key);
        }
    }

    return servers;
}

async function installMcpServers(
    payload: SyncPayload,
): Promise<InstallMcpServersResult> {
    const { cwd } = payload.context;

    const servers = await collectMcpServers(payload);

    const { results, workByFile } = collectFileWork({
        cwd: cwd,
        selectedAgents: payload.selectedAgents,
        servers: servers,
    });

    const artifactPaths: string[] = [];

    for (const [filePath, work] of workByFile) {
        const statusesByKey = await processFile(filePath, work);

        for (const agentDisplayName of work.agentDisplayNames) {
            for (const [key, status] of statusesByKey) {
                results.push({
                    agent: agentDisplayName,
                    capability: AgentCapability.Mcp,
                    item: key,
                    status: status,
                });
            }
        }

        const relPath = relative(cwd, filePath);

        // Gitignore every resolved config path, even one left unwritten this run because its content already matched.
        await git.ignore({ cwd: cwd, relPath: relPath });
        artifactPaths.push(relPath);
    }

    return { artifactPaths: artifactPaths, results: results };
}

/**
 * Groups the canonical servers destined for each agent's config file, one file work entry per path.
 * An agent with no MCP support gets an unsupported result row per server instead, and no file work.
 */
function collectFileWork(
    options: CollectFileWorkOptions,
): CollectFileWorkResult {
    const { cwd, selectedAgents, servers } = options;

    const workByFile = new Map<string, FileWork>();
    const results: SyncResult[] = [];

    for (const agent of selectedAgents) {
        if (!agent.mcp) {
            for (const server of servers) {
                results.push({
                    agent: agent.displayName,
                    capability: AgentCapability.Mcp,
                    item: server.key,
                    status: SyncStatus.Unsupported,
                });
            }

            continue;
        }

        const filePath = resolveConfigPath(agent.mcp, cwd);
        const existing = workByFile.get(filePath);

        if (existing) {
            existing.agentDisplayNames.push(agent.displayName);
            continue;
        }

        workByFile.set(filePath, {
            agentDisplayNames: [agent.displayName],
            mcp: agent.mcp,
            servers: servers,
        });
    }

    return { results: results, workByFile: workByFile };
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
 * Reads one file once, reconciles its servers map against the canonical set,
 * and writes it back only if that actually changed it.
 * Returns the resulting status of every key that changed.
 */
async function processFile(
    filePath: string,
    work: FileWork,
): Promise<Map<string, SyncStatus>> {
    const format = detectFormat(filePath);
    const originalText = (await filesystem.readFile(filePath)) ?? "";

    const { statusesByKey, text } = reconcileMcpServersAction({
        format: format,
        mcp: work.mcp,
        servers: work.servers,
        text: originalText,
    });

    if (text === originalText) {
        return statusesByKey;
    }

    await filesystem.mkdir(dirname(filePath));
    await filesystem.writeFile({ content: text, path: filePath });

    return statusesByKey;
}
