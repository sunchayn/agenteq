import artifactsManager from "@artifacts/services/artifacts-manager/index.js";
import env from "@infrastructure/env.js";
import type { RawSyncOptions } from "@console/utils/console.js";

/**
 * Resolves options from CLI flags first, falling back to environment variables when a flag is absent.
 */
export function resolveCommonSyncOptions(
    options: RawSyncOptions,
): ResolvedSyncOptions {
    const rawAgents = options.agents ?? env.readString("AGENTEQ_AGENTS");

    return {
        agents: rawAgents
            ? rawAgents.split(",").map((name) => name.trim())
            : [],
        isJson: options.json ?? env.readFlag("AGENTEQ_JSON"),
        only: options.only ?? env.readString("AGENTEQ_ONLY"),
        shouldSkipPrompts: options.yes ?? env.readFlag("AGENTEQ_YES"),
        sourceDir:
            options.sourceDir ??
            env.readString("AGENTEQ_SOURCE_DIR") ??
            artifactsManager.DEFAULT_SOURCE_DIR,
    };
}

/*
 * Interface & Types.
 */

export type ResolvedSyncOptions = Omit<
    RawSyncOptions,
    "agents" | "json" | "yes"
> & {
    agents: string[];
    isJson: boolean;
    shouldSkipPrompts: boolean;
    sourceDir: string;
};
