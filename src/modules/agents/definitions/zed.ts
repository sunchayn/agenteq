import { stdioMapper } from "@agents/mcpMappers/stdio-mapper.js";
import { untypedRemoteMapper } from "@agents/mcpMappers/remote-mapper.js";
import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";

/**
 * @see https://zed.dev
 */
const zed = new Agent({
    name: "zed",
    displayName: "Zed",
    guidelinesPath: "AGENTS.md",
    skillsDir: ".agents/skills",
    mcp: createMcpConfiguration({
        configKey: "context_servers",
        configPath: ".zed/settings.json",
        entryMappers: { remote: untypedRemoteMapper, stdio: stdioMapper },
    }),
    detectProjectPathUsing: () =>
        createDetectionConfiguration({ paths: [".zed"] }),
    detectSystemPathUsing: (platform) =>
        createDetectionConfiguration({
            command:
                platform === "linux"
                    ? ["zed", "zeditor"]
                    : platform === "win32"
                      ? "zed"
                      : undefined,
            paths:
                platform === "darwin" ? ["/Applications/Zed.app"] : undefined,
        }),
});

export default zed;
