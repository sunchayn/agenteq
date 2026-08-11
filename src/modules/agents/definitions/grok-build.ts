import { stdioMapper } from "@agents/mcpMappers/stdio-mapper.js";
import { untypedRemoteMapper } from "@agents/mcpMappers/remote-mapper.js";
import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";

/**
 * @see https://x.ai/build
 */
const grokBuild = new Agent({
    name: "grok_build",
    displayName: "Grok Build",
    guidelinesPath: "AGENTS.md",
    skillsDir: ".grok/skills",
    mcp: createMcpConfiguration({
        configKey: "mcp_servers",
        configPath: ".grok/config.toml",
        entryMappers: { remote: untypedRemoteMapper, stdio: stdioMapper },
    }),
    detectProjectPathUsing: () =>
        createDetectionConfiguration({
            files: [".grok/config.toml"],
            paths: [".grok"],
        }),
    detectSystemPathUsing: (platform) =>
        createDetectionConfiguration({
            command: "grok",
            paths: platform === "win32" ? ["%USERPROFILE%/.grok"] : ["~/.grok"],
        }),
});

export default grokBuild;
