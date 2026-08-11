import { stdioMapper } from "@agents/mcpMappers/stdio-mapper.js";
import { untypedRemoteMapper } from "@agents/mcpMappers/remote-mapper.js";
import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";

/**
 * @see https://ampcode.com
 */
const amp = new Agent({
    name: "amp",
    displayName: "Amp",
    guidelinesPath: "AGENTS.md",
    skillsDir: ".agents/skills",
    mcp: createMcpConfiguration({
        configKey: "amp.mcpServers",
        configPath: ".amp/settings.json",
        entryMappers: { remote: untypedRemoteMapper, stdio: stdioMapper },
    }),
    detectProjectPathUsing: () =>
        createDetectionConfiguration({ paths: [".amp"] }),
    detectSystemPathUsing: (platform) =>
        createDetectionConfiguration({
            command: "amp",
            paths:
                platform === "win32"
                    ? ["%USERPROFILE%/.amp", "%USERPROFILE%/.config/amp"]
                    : ["~/.amp", "~/.config/amp"],
        }),
});

export default amp;
