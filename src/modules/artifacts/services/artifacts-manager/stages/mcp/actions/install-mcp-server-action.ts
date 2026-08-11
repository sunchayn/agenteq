import type { McpConfiguration } from "@agents/types/mcp-configuration.js";
import type { McpServer } from "@agents/entities/mcp-server.js";
import { ConfigFileFormat } from "@artifacts/enums/config-file-format.js";
import { jsonFormatter, tomlFormatter, yamlFormatter } from "../formatters.js";
import type { FormatInstallResult, McpFormatter } from "../formatters.js";

/**
 * Install a given MCP server into the agent's relevant config file.
 */
export default function installMcpServerAction(
    options: InstallMcpServerActionOptions,
): FormatInstallResult {
    const { format, mcp, server, text } = options;

    return formatters[format].apply({
        config: server,
        keyPath: mcp.configKeyPath,
        mapper: (mapped) => mapped.toAgentEntry(mcp.entryMappers),
        text: text,
    });
}

/*
 * Interface & Types.
 */

export interface InstallMcpServerActionOptions {
    mcp: McpConfiguration;
    server: McpServer;
    format: ConfigFileFormat;
    text: string;
}

/*
 * Internal.
 */

const formatters: Record<ConfigFileFormat, McpFormatter> = {
    [ConfigFileFormat.Json]: jsonFormatter,
    [ConfigFileFormat.Toml]: tomlFormatter,
    [ConfigFileFormat.Yaml]: yamlFormatter,
};
