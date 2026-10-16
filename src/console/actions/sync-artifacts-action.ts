import artifactsManager from "@artifacts/services/artifacts-manager/index.js";
import output from "@infrastructure/terminal/output.js";
import type Agent from "@agents/entities/agent.js";
import type { RunContext } from "@shared/types/run-context.js";
import type { AgentCapability } from "@artifacts/enums/agent-capability.js";
import ensureRemoteClonePathsAction from "@console/actions/ensure-remote-clone-paths-action.js";
import updateRemoteSourcePinsAction from "@artifacts/actions/update-remote-source-pins-action.js";
import { printSyncOutcome } from "@console/actions/concerns/print-sync-outcome.js";

/**
 * Runs the artifacts (guidelines, skills, etc.) sync flow along the informational output for the user.
 * Returns whether the sync had a failure, so the caller can react appropriately to the result.
 */
export default async function syncArtifactsAction(
    options: RunSyncFlowOptions,
): Promise<boolean> {
    const {
        agents,
        capabilities,
        context,
        isJson,
        label,
        shouldForce,
        shouldSkipPrompts,
        shouldUpdatePins,
    } = options;

    if (!isJson) {
        output.intro(context.isDryRun ? `${label} (dry run)` : label);
    }

    // A dry run only resolves and reports, it never saves a clone path prompt answer or re-pins a remote source.
    if (!context.isDryRun) {
        await ensureRemoteClonePathsAction({
            context: context,
            shouldSkipPrompts: shouldSkipPrompts,
        });
    }

    const updatePinWarnings =
        shouldUpdatePins && !context.isDryRun
            ? await updateRemoteSourcePinsAction({ context: context })
            : [];

    const outcome = await artifactsManager.sync({
        capabilities: capabilities,
        context: context,
        selectedAgents: agents,
        shouldForce: shouldForce,
    });

    const outcomeWithPinWarnings =
        updatePinWarnings.length === 0
            ? outcome
            : outcome.withRemoteSourceWarnings([
                  ...updatePinWarnings,
                  ...outcome.remoteSourceWarnings,
              ]);

    printSyncOutcome({
        isDryRun: context.isDryRun,
        isJson: isJson,
        outcome: outcomeWithPinWarnings,
    });

    return outcome.hasFailed;
}

/*
 * Interface & Types.
 */

interface RunSyncFlowOptions {
    agents: Agent[];
    capabilities: AgentCapability[];
    context: RunContext;
    isJson: boolean;
    label: string;
    shouldForce?: boolean;
    shouldSkipPrompts: boolean;
    shouldUpdatePins?: boolean;
}
