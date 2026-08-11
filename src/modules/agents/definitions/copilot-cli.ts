import { remoteMapper } from "@agents/mcpMappers/remote-mapper.js";
import { stdioMapper } from "@agents/mcpMappers/stdio-mapper.js";
import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";

/**
 * @see https://github.com/features/copilot/cli
 */
const copilotCli = new Agent({
    name: "copilot_cli",
    displayName: "GitHub Copilot CLI",
    guidelinesPath: "AGENTS.md",
    skillsDir: ".github/skills",
    mcp: createMcpConfiguration({
        configPath: ".mcp.json",
        entryMappers: { remote: remoteMapper, stdio: stdioMapper },
    }),
    detectProjectPathUsing: () =>
        createDetectionConfiguration({
            files: ["AGENTS.md"],
            paths: [".github/copilot"],
        }),
    detectSystemPathUsing: () =>
        createDetectionConfiguration({ command: "copilot" }),
});

export default copilotCli;
