import { stdioMapper } from "@agents/mcpMappers/stdio-mapper.js";
import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";
import type { McpRemoteServer } from "@agents/entities/mcp-server.js";

/**
 * @see https://github.com/RooCodeInc/Roo-Code
 */
const roo = new Agent({
    name: "roo",
    displayName: "Roo Code",
    guidelinesPath: ".roorules",
    mcp: createMcpConfiguration({
        configPath: ".roo/mcp.json",
        entryMappers: { remote: toRemoteConfig, stdio: stdioMapper },
    }),
    detectProjectPathUsing: () =>
        createDetectionConfiguration({ paths: [".roo"] }),
    detectSystemPathUsing: () =>
        createDetectionConfiguration({
            command: "roo",
            paths: ["~/.vscode/extensions/rooveterinaryinc.roo-cline-*"],
        }),
});

/*
 * Internal.
 */

/**
 * Roo Code's schema rejects the literal type value "http", accepting only "streamable-http" for that transport.
 */
function toRemoteConfig(server: McpRemoteServer): Record<string, unknown> {
    return {
        type: server.type === "http" ? "streamable-http" : server.type,
        url: server.url,
        ...(server.headers ? { headers: server.headers } : {}),
        ...server.extra,
    };
}

export default roo;
