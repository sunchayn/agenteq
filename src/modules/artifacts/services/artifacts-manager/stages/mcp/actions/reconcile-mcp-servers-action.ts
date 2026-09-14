import type { McpConfiguration } from "@agents/types/mcp-configuration.js";
import type { McpServer } from "@agents/entities/mcp-server.js";
import { ConfigFileFormat } from "@artifacts/enums/config-file-format.js";
import type { FormatReconcileResult } from "../formatters.js";
import { formattersByFormat } from "./formatter-registry.js";

/**
 * Reconciles the agent's config file against the canonical set of MCP servers.
 * Every server not in that set gets removed, agenteq owns the whole servers map.
 */
export default function reconcileMcpServersAction(
    options: ReconcileMcpServersActionOptions,
): FormatReconcileResult {
    const { format, mcp, servers, text } = options;

    return formattersByFormat[format].reconcile({
        keyPath: mcp.configKeyPath,
        mapper: (server) => server.toAgentEntry(mcp.entryMappers),
        servers: servers,
        text: text,
    });
}

/*
 * Interface & Types.
 */

export interface ReconcileMcpServersActionOptions {
    mcp: McpConfiguration;
    servers: McpServer[];
    format: ConfigFileFormat;
    text: string;
}
