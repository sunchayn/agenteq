import type { DetectionConfiguration } from "@agents/types/detection-configuration.js";
import type { McpConfiguration } from "@agents/types/mcp-configuration.js";

export interface AgentOptions {
    /**
     * Machine-readable key, e.g. "claude_code".
     */
    name: string;
    displayName: string;
    /**
     * Path (relative to the project root) to the agent-specific guidelines file.
     */
    guidelinesPath?: string;
    /**
     * Path (relative to the project root) to the agent-specific skills directory to sync into.
     */
    skillsDir?: string;
    /**
     * Path (relative to the project root) to the agent-specific commands directory to sync into.
     */
    commandsDir?: string;
    /**
     * Extension to rename each synced command file to, replacing its trailing ".md", for an agent whose command file naming differs from the canonical source.
     */
    commandsFileExtension?: string;
    mcp?: McpConfiguration;
    detectProjectPathUsing: () => DetectionConfiguration;
    detectSystemPathUsing: (
        platform: NodeJS.Platform,
    ) => DetectionConfiguration;
}

export default class Agent {
    readonly name: string;
    readonly displayName: string;
    readonly guidelinesPath?: string;
    readonly skillsDir?: string;
    readonly commandsDir?: string;
    readonly commandsFileExtension?: string;
    readonly mcp?: McpConfiguration;
    readonly detectProjectPathUsing: () => DetectionConfiguration;
    readonly detectSystemPathUsing: (
        platform: NodeJS.Platform,
    ) => DetectionConfiguration;

    constructor(options: AgentOptions) {
        this.name = options.name;
        this.displayName = options.displayName;
        this.guidelinesPath = options.guidelinesPath;
        this.skillsDir = options.skillsDir;
        this.commandsDir = options.commandsDir;
        this.commandsFileExtension = options.commandsFileExtension;
        this.mcp = options.mcp;
        this.detectProjectPathUsing = options.detectProjectPathUsing;
        this.detectSystemPathUsing = options.detectSystemPathUsing;
    }

    supportsMcp(): boolean {
        return this.mcp !== undefined;
    }

    supportsCommands(): boolean {
        return this.commandsDir !== undefined;
    }

    supportsSkills(): boolean {
        return this.skillsDir !== undefined;
    }

    supportsGuidelines(): boolean {
        return this.guidelinesPath !== undefined;
    }
}
