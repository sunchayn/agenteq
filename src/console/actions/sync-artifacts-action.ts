import artifactsManager from "@artifacts/services/artifacts-manager/index.js";
import output from "@infrastructure/terminal/output.js";
import type Agent from "@agents/entities/agent.js";
import type { RunContext } from "@shared/types/run-context.js";
import type { AgentCapability } from "@artifacts/enums/agent-capability.js";
import { printSyncOutcome } from "@console/actions/concerns/print-sync-outcome.js";

/**
 * Runs the artifacts (guidelines, skills, etc.) sync flow along the informational output for the user.
 * Returns whether the sync had a failure, so the caller can react appropriately to the result.
 */
export default async function syncArtifactsAction(
    options: RunSyncFlowOptions,
): Promise<boolean> {
    const { agents, capabilities, context, isJson, label } = options;

    if (!isJson) {
        output.intro(label);
    }

    const outcome = await artifactsManager.sync({
        capabilities: capabilities,
        context: context,
        selectedAgents: agents,
    });

    printSyncOutcome({
        isJson: isJson,
        outcome: outcome,
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
}
