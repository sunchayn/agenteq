import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";
import type { McpRemoteServer } from "@agents/entities/mcp-server.js";

/**
 * @see https://opencode.ai
 */
const opencode = new Agent({
    name: "opencode",
    displayName: "OpenCode",
    commandsDir: ".opencode/command",
    guidelinesPath: "AGENTS.md",
    skillsDir: ".agents/skills",
    mcp: createMcpConfiguration({
        configKey: "mcp",
        configPath: "opencode.json",
        // OpenCode's stdio shape differs from every other agent.
        // Command and args bundle into a single array, and the env field is called "environment".
        entryMappers: {
            remote: toRemoteConfig,
            stdio: (server) => ({
                command: [server.command, ...(server.args ?? [])],
                enabled: true,
                environment: server.env ?? {},
                type: "local",
                ...server.extra,
            }),
        },
    }),
    detectProjectPathUsing: () =>
        createDetectionConfiguration({
            files: ["opencode.json", "opencode.jsonc"],
        }),
    detectSystemPathUsing: () =>
        createDetectionConfiguration({ command: "opencode" }),
});

/*
 * Internal.
 */

/**
 * OpenCode's remote entries add an `enabled` field alongside the url, and support an optional headers object.
 */
function toRemoteConfig(server: McpRemoteServer): Record<string, unknown> {
    return {
        enabled: true,
        type: "remote",
        url: server.url,
        ...(server.headers ? { headers: server.headers } : {}),
        ...server.extra,
    };
}

export default opencode;
