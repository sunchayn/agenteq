import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";
import type { McpRemoteServer } from "@agents/entities/mcp-server.js";

/**
 * @see https://kilo.ai
 */
const kilo = new Agent({
    name: "kilo",
    displayName: "Kilo Code",
    guidelinesPath: ".kilocode/rules/AGENTS.md",
    mcp: createMcpConfiguration({
        configKey: "mcp",
        configPath: "kilo.jsonc",
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
            files: ["kilo.jsonc"],
            paths: [".kilocode", ".kilo"],
        }),
    detectSystemPathUsing: (platform) =>
        createDetectionConfiguration({
            command: "kilo",
            paths: extensionPaths(platform),
        }),
});

/*
 * Internal.
 */

const HOST_EDITOR_DIRS = [".vscode", ".cursor", ".windsurf", ".vscode-oss"];

/**
 * Builds the install-folder glob for every VS Code family host Kilo Code's extension can install into,
 * plus a JetBrains plugins-folder glob, since the plugin's on-disk folder name isn't a stable, documented value.
 */
function extensionPaths(platform: NodeJS.Platform): string[] {
    const home = platform === "win32" ? "%USERPROFILE%" : "~";

    const hostPaths = HOST_EDITOR_DIRS.map(
        (dir) => `${home}/${dir}/extensions/kilocode.kilo-code-*`,
    );

    const jetbrainsBase =
        platform === "darwin"
            ? "~/Library/Application Support/JetBrains"
            : platform === "win32"
              ? "%APPDATA%/JetBrains"
              : "~/.config/JetBrains";

    return [...hostPaths, `${jetbrainsBase}/*/plugins/*kilo*`];
}

/**
 * Kilo's remote entries add an "enabled" field alongside the url, and support an optional headers object.
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

export default kilo;
