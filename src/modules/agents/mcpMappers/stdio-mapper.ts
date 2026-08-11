import type { McpStdioServer } from "@agents/entities/mcp-server.js";
import type { McpServerMapper } from "@agents/types/mcp-server-mapper.js";

export const stdioMapper: McpServerMapper<McpStdioServer> = map;

/**
 * Variant of the default stdio shape for agents that tag stdio entries with an explicit type field.
 */
export const typedStdioMapper: McpServerMapper<McpStdioServer> = typedMap;

/*
 * Internal.
 */

function map(server: McpStdioServer): Record<string, unknown> {
    return {
        args: server.args ?? [],
        command: server.command,
        env: server.env ?? {},
        ...(server.cwd ? { cwd: server.cwd } : {}),
        ...server.extra,
    };
}

function typedMap(server: McpStdioServer): Record<string, unknown> {
    return {
        ...map(server),
        type: "stdio",
    };
}
