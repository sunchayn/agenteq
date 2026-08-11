import type { McpServerMappers } from "@agents/types/mcp-server-mapper.js";

/**
 * Configures how MCPs are supported in the agent.
 */
export interface McpConfiguration {
    /**
     * Path to the agent's MCP config file, relative to the project root unless it starts with "~" or an env reference.
     * A function receives the current platform, for an agent whose config path differs across operating systems.
     */
    readonly configPath: string | ((platform: NodeJS.Platform) => string);
    /**
     * The full key path the servers live under, normalized from configKey, defaulting to ["mcpServers"].
     */
    readonly configKeyPath: string[];
    readonly entryMappers: McpServerMappers;
}

/**
 * Normalizes a raw options bag into an McpConfiguration.
 * The key path servers live under always comes out as a plain, present list, whether single or nested.
 */
export function createMcpConfiguration(
    options: McpConfigurationOptions,
): McpConfiguration {
    return {
        configKeyPath: Array.isArray(options.configKey)
            ? options.configKey
            : [options.configKey ?? "mcpServers"],
        configPath: options.configPath,
        entryMappers: options.entryMappers,
    };
}

/*
 * Interface & Types.
 */

interface McpConfigurationOptions {
    /**
     * Path (relative to the project root) to the agent's MCP config file.
     * A function receives the current platform, for an agent whose config path differs across operating systems.
     */
    configPath: string | ((platform: NodeJS.Platform) => string);
    /**
     * Top-level key the servers live under. Defaults to "mcpServers". An array is a nested path (e.g. ["amp", "mcpServers"]).
     */
    configKey?: string | string[];
    entryMappers: McpServerMappers;
}
