import { remoteMapper } from "@agents/mcpMappers/remote-mapper.js";
import { typedStdioMapper } from "@agents/mcpMappers/stdio-mapper.js";
import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";

/**
 * @see https://claude.com/product/claude-code
 */
const claudeCode = new Agent({
    name: "claude_code",
    displayName: "Claude Code",
    guidelinesPath: "CLAUDE.md",
    skillsDir: ".claude/skills",
    commandsDir: ".claude/commands",
    mcp: createMcpConfiguration({
        configPath: ".mcp.json",
        entryMappers: { remote: remoteMapper, stdio: typedStdioMapper },
    }),
    detectProjectPathUsing: () =>
        createDetectionConfiguration({
            files: ["CLAUDE.md"],
            paths: [".claude"],
        }),
    detectSystemPathUsing: () =>
        createDetectionConfiguration({ command: "claude" }),
});

export default claudeCode;
