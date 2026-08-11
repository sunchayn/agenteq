import { remoteMapper } from "@agents/mcpMappers/remote-mapper.js";
import { typedStdioMapper } from "@agents/mcpMappers/stdio-mapper.js";
import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";

/**
 * @see https://factory.ai
 */
const factory = new Agent({
    name: "factory",
    displayName: "Factory Droid",
    commandsDir: ".factory/commands",
    guidelinesPath: "AGENTS.md",
    skillsDir: ".factory/skills",
    mcp: createMcpConfiguration({
        configPath: ".factory/mcp.json",
        // Factory Droid's stdio entries may omit the type field, defaulting to stdio, but accept it explicitly too.
        entryMappers: { remote: remoteMapper, stdio: typedStdioMapper },
    }),
    detectProjectPathUsing: () =>
        createDetectionConfiguration({ paths: [".factory"] }),
    detectSystemPathUsing: (platform) =>
        createDetectionConfiguration({
            command: "droid",
            paths:
                platform === "win32"
                    ? ["%USERPROFILE%/.factory"]
                    : ["~/.factory"],
        }),
});

export default factory;
