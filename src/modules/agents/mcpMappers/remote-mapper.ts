import type { McpRemoteServer } from "@agents/entities/mcp-server.js";
import type { McpServerMapper } from "@agents/types/mcp-server-mapper.js";

export const remoteMapper: McpServerMapper<McpRemoteServer> = map;

/**
 * Shape for agents whose remote entries have no type field, where presence of a url alone identifies the entry as http or sse.
 */
export const untypedRemoteMapper: McpServerMapper<McpRemoteServer> = untypedMap;

/*
 * Internal.
 */

function map(server: McpRemoteServer): Record<string, unknown> {
    return {
        type: server.type,
        ...remoteBaseFields(server),
    };
}

function untypedMap(server: McpRemoteServer): Record<string, unknown> {
    return remoteBaseFields(server);
}

/**
 * The url, optional headers, and extra fields shared by every remote entry shape,
 * regardless of whether the agent also wants an explicit type field.
 */
function remoteBaseFields(server: McpRemoteServer): Record<string, unknown> {
    return {
        url: server.url,
        ...(server.headers ? { headers: server.headers } : {}),
        ...server.extra,
    };
}
