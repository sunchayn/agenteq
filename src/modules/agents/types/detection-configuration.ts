/**
 * Describes how to detect whether one agent is installed or not.
 */
export interface DetectionConfiguration {
    /**
     * Directories whose existence indicates the agent is present. Supports "~" and "$ENV"/"%ENV%" expansion.
     */
    readonly paths: string[];
    /**
     * Files whose existence indicates the agent is present. Supports the same expansion as `paths`.
     */
    readonly files: string[];
    /**
     * Binary name(s) to look up on PATH (e.g. "claude").
     */
    readonly commands: string[];
}

/**
 * Normalizes a raw options bag into a DetectionConfiguration.
 * Every optional or single-value field always comes out as a plain, present list.
 */
export function createDetectionConfiguration(
    options: DetectionConfigurationOptions,
): DetectionConfiguration {
    return {
        commands: Array.isArray(options.command)
            ? options.command
            : options.command
              ? [options.command]
              : [],
        files: options.files ?? [],
        paths: options.paths ?? [],
    };
}

/*
 * Interface & Types.
 */

interface DetectionConfigurationOptions {
    /**
     * Binary name(s) to look up on PATH (e.g. "claude"). An array matches if any resolve.
     */
    command?: string | string[];
    /**
     * Directories whose existence indicates the agent is present. Supports "~" and "$ENV"/"%ENV%" expansion.
     */
    paths?: string[];
    /**
     * Files whose existence indicates the agent is present. Supports the same expansion as `paths`.
     */
    files?: string[];
}
