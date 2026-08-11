import { stdioMapper } from "@agents/mcpMappers/stdio-mapper.js";
import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";
import type { McpRemoteServer } from "@agents/entities/mcp-server.js";

/**
 * @see https://antigravity.google
 */
const antigravity = new Agent({
    name: "antigravity",
    displayName: "Antigravity",
    guidelinesPath: "AGENTS.md",
    skillsDir: ".agents/skills",
    mcp: createMcpConfiguration({
        configPath: ".agents/mcp_config.json",
        entryMappers: { remote: toRemoteConfig, stdio: stdioMapper },
    }),
    detectProjectPathUsing: () =>
        createDetectionConfiguration({
            files: [".agents/mcp_config.json"],
            paths: [".agents"],
        }),
    detectSystemPathUsing: (platform) =>
        createDetectionConfiguration({
            // The IDE ships an "antigravity" shell command, and the "agy" CLI agent installs separately.
            // Either on PATH means Antigravity is present.
            command: ["antigravity", "agy"],
            paths:
                platform === "darwin"
                    ? ["/Applications/Antigravity.app"]
                    : platform === "win32"
                      ? ["%LOCALAPPDATA%/Programs/Antigravity IDE"]
                      : undefined,
        }),
});

/*
 * Internal.
 */

/**
 * Antigravity's remote entries carry the URL under a field named "serverUrl", not "url",
 * and never carry a type field, transport is inferred from serverUrl versus command.
 */
function toRemoteConfig(server: McpRemoteServer): Record<string, unknown> {
    return {
        serverUrl: server.url,
        ...(server.headers ? { headers: server.headers } : {}),
        ...server.extra,
    };
}

export default antigravity;
