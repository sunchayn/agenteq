import { stdioMapper } from "@agents/mcpMappers/stdio-mapper.js";
import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";
import type { McpRemoteServer } from "@agents/entities/mcp-server.js";

/**
 * @see https://junie.jetbrains.com
 */
const junie = new Agent({
    name: "junie",
    displayName: "Junie",
    commandsDir: ".junie/commands",
    guidelinesPath: "AGENTS.md",
    skillsDir: ".junie/skills",
    mcp: createMcpConfiguration({
        configPath: ".junie/mcp/mcp.json",
        entryMappers: {
            remote: toMcpRemoteShim,
            stdio: stdioMapper,
        },
    }),
    detectProjectPathUsing: () =>
        createDetectionConfiguration({ paths: [".idea", ".junie"] }),
    // Junie also ships its own standalone CLI, "junie", which runs independently of any IDE.
    // The IDE paths below cover IntelliJ IDEA, PyCharm, WebStorm, GoLand, and PhpStorm, every JetBrains IDE Junie supports.
    detectSystemPathUsing: (platform) =>
        createDetectionConfiguration({
            command: "junie",
            paths:
                platform === "darwin"
                    ? [
                          "/Applications/IntelliJ IDEA.app",
                          "/Applications/PyCharm.app",
                          "/Applications/WebStorm.app",
                          "/Applications/GoLand.app",
                          "/Applications/PhpStorm.app",
                      ]
                    : platform === "win32"
                      ? [
                            "%ProgramFiles%/JetBrains/IntelliJ IDEA*",
                            "%ProgramFiles%/JetBrains/PyCharm*",
                            "%ProgramFiles%/JetBrains/WebStorm*",
                            "%ProgramFiles%/JetBrains/GoLand*",
                            "%ProgramFiles%/JetBrains/PhpStorm*",
                            "%LOCALAPPDATA%/JetBrains/Toolbox/apps/IDEA-U/ch-*",
                            "%LOCALAPPDATA%/JetBrains/Toolbox/apps/PyCharm-P/ch-*",
                            "%LOCALAPPDATA%/JetBrains/Toolbox/apps/WebStorm/ch-*",
                            "%LOCALAPPDATA%/JetBrains/Toolbox/apps/GoLand/ch-*",
                            "%LOCALAPPDATA%/JetBrains/Toolbox/apps/PhpStorm/ch-*",
                            "%LOCALAPPDATA%/Programs/PhpStorm",
                        ]
                      : [
                            "/opt/idea",
                            "/opt/pycharm",
                            "/opt/webstorm",
                            "/opt/goland",
                            "/opt/phpstorm",
                            "/opt/PhpStorm*",
                            "/usr/local/bin/phpstorm",
                            "~/.local/share/JetBrains/Toolbox/apps/IDEA-U/ch-*",
                            "~/.local/share/JetBrains/Toolbox/apps/PyCharm-P/ch-*",
                            "~/.local/share/JetBrains/Toolbox/apps/WebStorm/ch-*",
                            "~/.local/share/JetBrains/Toolbox/apps/GoLand/ch-*",
                            "~/.local/share/JetBrains/Toolbox/apps/PhpStorm/ch-*",
                        ],
        }),
});

/*
 * Internal.
 */

/**
 * Junie has no native http or sse support.
 * A remote entry is wrapped as an npx invocation of the mcp-remote shim instead.
 * Headers and any other config field have no equivalent in that shim, so they are dropped.
 */
function toMcpRemoteShim(server: McpRemoteServer): Record<string, unknown> {
    return {
        args: ["-y", "mcp-remote", server.url],
        command: "npx",
    };
}

export default junie;
