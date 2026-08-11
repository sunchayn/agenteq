import type {
    McpRemoteServer,
    McpServer,
    McpStdioServer,
} from "@agents/entities/mcp-server.js";

/**
 * Converts one canonical MCP server, as configured in agenteq, into the object shape a specific agent expects.
 * Mapped shapes are later rendered into the relevant formats, such as TOML or YAML, by that agent's `McpFormatter`.
 */
export type McpServerMapper<T extends McpServer = McpServer> = (
    server: T,
) => Record<string, unknown>;

export interface McpServerMappers {
    stdio: McpServerMapper<McpStdioServer>;
    remote: McpServerMapper<McpRemoteServer>;
}
