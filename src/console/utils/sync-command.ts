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
        isDryRun: options.dryRun ?? env.readFlag("AGENTEQ_DRY_RUN"),
        isJson: options.json ?? env.readFlag("AGENTEQ_JSON"),
        only: options.only ?? env.readString("AGENTEQ_ONLY"),
        shouldSkipInCi: options.skipInCi ?? env.readFlag("AGENTEQ_SKIP_IN_CI"),
        shouldSkipPrompts: options.yes ?? env.readFlag("AGENTEQ_YES"),
        shouldUpdatePins:
            options.updatePins ?? env.readFlag("AGENTEQ_UPDATE_PINS"),
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
    "agents" | "json" | "yes" | "skipInCi" | "updatePins" | "dryRun"
> & {
    agents: string[];
    isDryRun: boolean;
    isJson: boolean;
    shouldSkipInCi: boolean;
    shouldSkipPrompts: boolean;
    shouldUpdatePins: boolean;
    sourceDir: string;
};
