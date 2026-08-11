import { stdioMapper } from "@agents/mcpMappers/stdio-mapper.js";
import { untypedRemoteMapper } from "@agents/mcpMappers/remote-mapper.js";
import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";

/**
 * @see https://kiro.dev
 */
const kiro = new Agent({
    name: "kiro",
    displayName: "Kiro",
    guidelinesPath: "AGENTS.md",
    skillsDir: ".kiro/skills",
    mcp: createMcpConfiguration({
        configPath: ".kiro/settings/mcp.json",
        entryMappers: { remote: untypedRemoteMapper, stdio: stdioMapper },
    }),
    detectProjectPathUsing: () =>
        createDetectionConfiguration({ paths: [".kiro"] }),
    detectSystemPathUsing: (platform) =>
        createDetectionConfiguration({
            // "kiro" opens the IDE, and "kiro-cli" is the separate agentic CLI.
            // Either on PATH means Kiro is present, which matters for GUI-only installs.
            command: ["kiro", "kiro-cli"],
            paths:
                platform === "darwin"
                    ? ["/Applications/Kiro.app"]
                    : platform === "win32"
                      ? ["%ProgramFiles%/Kiro", "%LOCALAPPDATA%/Programs/Kiro"]
                      : [
                            "/opt/kiro",
                            "/usr/local/bin/kiro",
                            "~/.local/bin/kiro",
                        ],
        }),
});

export default kiro;
