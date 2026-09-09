import loadAgentsFileAction from "@agents/actions/load-agents-file-action.js";
import resolveBoostSkillsEnabledAction from "@agents/actions/resolve-boost-skills-enabled-action.js";
import { CliError } from "@support/errors/cli-error.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Resolves which capabilities to sync, use the following order.
 *     1. from --only
 *     2. then the saved agents file
 *     3. then a default of all*
 *
 * *It excludes Skills when Laravel Boost already manages skills for this project.
 *
 * Also reports whether the result needs to be persisted back to the saved agents file.
 */
export async function resolveCapabilitiesToSync(
    options: ResolveCapabilitiesOptions,
): Promise<{
    capabilities: AgentCapability[];
    isDirty: boolean;
}> {
    const { context, only } = options;

    if (only !== undefined) {
        // An explicit --only value always needs saving, it did not come from the file.
        return { capabilities: parseCapabilities(only), isDirty: true };
    }

    const saved = await loadAgentsFileAction({ context: context });

    if (saved?.capabilities) {
        // Reusing a value already in the saved file does not need to be written back.
        return {
            capabilities: parseCapabilities(saved.capabilities.join(",")),
            isDirty: false,
        };
    }

    // No flag and nothing saved, so this default is freshly established and needs saving.
    const defaultCapabilities = parseCapabilities(undefined);

    const boostManagesSkills = await resolveBoostSkillsEnabledAction({
        context: context,
    });

    const capabilities = boostManagesSkills
        ? defaultCapabilities.filter(
              (capability) => capability !== AgentCapability.Skills,
          )
        : defaultCapabilities;

    return { capabilities: capabilities, isDirty: true };
}

/**
 * Parses the comma-separated `--only` flag into a validated Capability list,
 * defaulting to every capability when the flag is absent.
 */
function parseCapabilities(only?: string): AgentCapability[] {
    const allCapabilities = Object.values(AgentCapability);

    if (!only) {
        return allCapabilities;
    }

    const requested = only.split(",").map((capability) => capability.trim());

    const invalid = requested.filter(
        (capability) =>
            !allCapabilities.includes(capability as AgentCapability),
    );

    if (invalid.length > 0) {
        throw new CliError(
            "E_UNKNOWN_CAPABILITY",
            `Unknown capability(ies): ${invalid.join(", ")}. Expected one of: ${allCapabilities.join(", ")}.`,
        );
    }

    return requested as AgentCapability[];
}

/*
 * Interface & Types.
 */

export interface ResolveCapabilitiesOptions {
    context: RunContext;
    only: string | undefined;
}
