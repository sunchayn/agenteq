import { stdioMapper } from "@agents/mcpMappers/stdio-mapper.js";
import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";
import type { McpRemoteServer } from "@agents/entities/mcp-server.js";

/**
 * @see https://developers.openai.com/codex
 */
const codex = new Agent({
    name: "codex",
    displayName: "Codex CLI",
    guidelinesPath: "AGENTS.md",
    skillsDir: ".agents/skills",
    mcp: createMcpConfiguration({
        // Servers live under a mcp_servers.<key> TOML table rather than a top-level JSON object.
        configKey: "mcp_servers",
        configPath: ".codex/config.toml",
        entryMappers: { remote: toRemoteConfig, stdio: stdioMapper },
    }),
    detectProjectPathUsing: () =>
        createDetectionConfiguration({
            files: ["AGENTS.md"],
            paths: [".codex"],
        }),
    detectSystemPathUsing: () =>
        createDetectionConfiguration({ command: "codex" }),
});

/*
 * Internal.
 */

/**
 * Codex infers the transport from the presence of `url` versus `command`, so it has no `type` field.
 * Static headers live under `http_headers`.
 */
function toRemoteConfig(server: McpRemoteServer): Record<string, unknown> {
    return {
        url: server.url,
        ...(server.headers ? { http_headers: server.headers } : {}),
        ...server.extra,
    };
}

export default codex;
