import { stdioMapper } from "@agents/mcpMappers/stdio-mapper.js";
import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";
import type { McpRemoteServer } from "@agents/entities/mcp-server.js";

/**
 * @see https://devin.ai
 */
const devin = new Agent({
    name: "devin",
    displayName: "Devin",
    guidelinesPath: "AGENTS.md",
    skillsDir: ".devin/skills",
    mcp: createMcpConfiguration({
        configPath: ".devin/mcp_config.json",
        entryMappers: { remote: toRemoteConfig, stdio: stdioMapper },
    }),
    detectProjectPathUsing: () =>
        createDetectionConfiguration({ paths: [".devin"] }),
    detectSystemPathUsing: () =>
        createDetectionConfiguration({ command: "devin" }),
});

/*
 * Internal.
 */

/**
 * Devin's remote entries carry the transport under a field named "transport", not "type".
 */
function toRemoteConfig(server: McpRemoteServer): Record<string, unknown> {
    return {
        transport: server.type,
        url: server.url,
        ...(server.headers ? { headers: server.headers } : {}),
        ...server.extra,
    };
}

export default devin;
