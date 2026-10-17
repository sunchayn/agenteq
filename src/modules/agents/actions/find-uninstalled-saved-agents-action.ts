import detectAgentsAction from "@agents/actions/detect-agents-action.js";
import resolveSavedAgentsAction from "@agents/actions/resolve-saved-agents-action.js";
import { DoctorFinding } from "@shared/data-transfer-objects/doctor-finding.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Checks every agent saved in the agents file against the same detection `agenteq detect` uses.
 * Reports one finding per saved agent that is no longer installed, system-wide or in this project.
 */
export default async function findUninstalledSavedAgentsAction(
    options: FindUninstalledSavedAgentsOptions,
): Promise<DoctorFinding[]> {
    const { context } = options;

    const savedAgents = await resolveSavedAgentsAction({ context: context });

    if (!savedAgents || savedAgents.length === 0) {
        return [];
    }

    const statuses = await detectAgentsAction({ cwd: context.cwd });

    const installedNames = new Set(
        statuses
            .filter((status) => status.isInstalled)
            .map((status) => status.agent.name),
    );

    return savedAgents
        .filter((agent) => !installedNames.has(agent.name))
        .map(
            (agent) =>
                new DoctorFinding({
                    fixCommand: "agenteq init",
                    message: `Agent "${agent.displayName}" is configured but no longer installed.`,
                }),
        );
}

/*
 * Interface & Types.
 */

interface FindUninstalledSavedAgentsOptions {
    context: RunContext;
}
