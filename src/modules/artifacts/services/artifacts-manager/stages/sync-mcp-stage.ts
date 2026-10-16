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
import { removeNamespace } from "@artifacts/actions/discover-remote-capabilities-action.js";
import type { SyncResult } from "@artifacts/types/sync-result.js";
import { SyncPayload } from "@artifacts/data-transfer-objects/sync-payload.js";
import reconcileMcpServersAction from "./mcp/actions/reconcile-mcp-servers-action.js";

/**
 * Discovers the canonical MCP servers, local plus a remote source's selected entries.
 * Reconciles each selected agent's config file against that set, marking one with no MCP support as unsupported.
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

/**
 * One agent config file's pending write, every mcp server it should end up with,
 * and every agent that shares this same file path.
 */
interface PendingMcpWrite {
    mcp: McpConfiguration;
    agentDisplayNames: string[];
    servers: McpServer[];
}

interface InstallMcpServersResult {
    results: SyncResult[];
    artifactPaths: string[];
}

interface CollectConfigWritesOptions {
    selectedAgents: Agent[];
    servers: McpServer[];
    cwd: string;
}

interface CollectConfigWritesResult {
    writesByFile: Map<string, PendingMcpWrite>;
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
            recursive: true,
            sourceDir: ".",
        });

        // A saved mcp selection entry can carry a namespace prefix, but a server's own key never does.
        const selectedKeys = new Set(remote.selection.mcp.map(removeNamespace));

        for (const server of remoteServers) {
            if (!selectedKeys.has(server.key) || claimedKeys.has(server.key)) {
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

    const { results, writesByFile } = collectConfigWrites({
        cwd: cwd,
        selectedAgents: payload.selectedAgents,
        servers: servers,
    });

    const artifactPaths: string[] = [];
    const { isDryRun } = payload.context;

    for (const [filePath, write] of writesByFile) {
        const statusesByKey = await processFile(filePath, write, isDryRun);

        for (const agentDisplayName of write.agentDisplayNames) {
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
        // A dry run only reports the status, it never touches .gitignore.
        if (!isDryRun) {
            await git.ignore({ cwd: cwd, relPath: relPath });
        }

        artifactPaths.push(relPath);
    }

    return { artifactPaths: artifactPaths, results: results };
}

/**
 * Groups the canonical servers destined for each agent's config file, one config write per path.
 * An agent with no MCP support gets an unsupported result row per server instead, and no config write.
 */
function collectConfigWrites(
    options: CollectConfigWritesOptions,
): CollectConfigWritesResult {
    const { cwd, selectedAgents, servers } = options;

    const writesByFile = new Map<string, PendingMcpWrite>();
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
        const existing = writesByFile.get(filePath);

        if (existing) {
            existing.agentDisplayNames.push(agent.displayName);
            continue;
        }

        writesByFile.set(filePath, {
            agentDisplayNames: [agent.displayName],
            mcp: agent.mcp,
            servers: servers,
        });
    }

    return { results: results, writesByFile: writesByFile };
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
 * and writes it back only if that actually changed it and this isn't a dry run.
 * Returns the resulting status of every key that changed, which a dry run reports without writing.
 */
async function processFile(
    filePath: string,
    write: PendingMcpWrite,
    isDryRun: boolean | undefined,
): Promise<Map<string, SyncStatus>> {
    const format = detectFormat(filePath);
    const originalText = (await filesystem.readFile(filePath)) ?? "";

    const { statusesByKey, text } = reconcileMcpServersAction({
        format: format,
        mcp: write.mcp,
        servers: write.servers,
        text: originalText,
    });

    if (text === originalText || isDryRun) {
        return statusesByKey;
    }

    await filesystem.mkdir(dirname(filePath));
    await filesystem.writeFile({ content: text, path: filePath });

    return statusesByKey;
}
