import { typedStdioMapper } from "@agents/mcpMappers/stdio-mapper.js";
import { untypedRemoteMapper } from "@agents/mcpMappers/remote-mapper.js";
import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";

/**
 * @see https://cursor.com
 */
const cursor = new Agent({
    name: "cursor",
    displayName: "Cursor",
    guidelinesPath: "AGENTS.md",
    skillsDir: ".cursor/skills",
    commandsDir: ".cursor/commands",
    mcp: createMcpConfiguration({
        configPath: ".cursor/mcp.json",
        entryMappers: { remote: untypedRemoteMapper, stdio: typedStdioMapper },
    }),
    detectProjectPathUsing: () =>
        createDetectionConfiguration({ paths: [".cursor"] }),
    detectSystemPathUsing: (platform) =>
        createDetectionConfiguration({
            command: "cursor",
            paths:
                platform === "darwin"
                    ? ["/Applications/Cursor.app"]
                    : platform === "win32"
                      ? ["%LOCALAPPDATA%/Programs/cursor"]
                      : ["~/.local/share/cursor", "/opt/cursor"],
        }),
});

export default cursor;
