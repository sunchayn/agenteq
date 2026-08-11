import { remoteMapper } from "@agents/mcpMappers/remote-mapper.js";
import { typedStdioMapper } from "@agents/mcpMappers/stdio-mapper.js";
import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";

/**
 * Targets the VS Code extension surface of GitHub Copilot. The JetBrains plugin is a separate agent, defined in copilot-jetbrains.ts, since it has no project-scoped MCP config and no reliable prompt-file support.
 *
 * @see https://github.com/features/copilot
 */
const copilot = new Agent({
    name: "copilot",
    displayName: "GitHub Copilot",
    guidelinesPath: ".github/copilot-instructions.md",
    commandsDir: ".github/prompts",
    // VS Code only recognizes a prompt file whose name ends in ".prompt.md".
    commandsFileExtension: ".prompt.md",
    mcp: createMcpConfiguration({
        // VS Code's native MCP support keys servers under "servers".
        configKey: "servers",
        configPath: ".vscode/mcp.json",
        // Copilot's stdio entries carry an explicit type field set to "stdio", unlike our default shape.
        // Its remote entries match our defaults exactly.
        entryMappers: { remote: remoteMapper, stdio: typedStdioMapper },
    }),
    detectProjectPathUsing: () =>
        createDetectionConfiguration({
            files: [".github/copilot-instructions.md"],
        }),
    detectSystemPathUsing: (platform) =>
        createDetectionConfiguration({
            paths:
                platform === "darwin"
                    ? ["~/.vscode/extensions", "~/.vscode-insiders/extensions"]
                    : platform === "win32"
                      ? [
                            "%USERPROFILE%/.vscode/extensions",
                            "%USERPROFILE%/.vscode-insiders/extensions",
                        ]
                      : [
                            "~/.vscode/extensions",
                            "~/.vscode-insiders/extensions",
                        ],
        }),
});

export default copilot;
