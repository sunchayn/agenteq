import git from "@infrastructure/git.js";
import resolveSavedAgentsAction from "@agents/actions/resolve-saved-agents-action.js";
import type Agent from "@agents/entities/agent.js";
import { DoctorFinding } from "@shared/data-transfer-objects/doctor-finding.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Checks that none of the paths `agenteq sync` generates ended up tracked by git.
 * A generated path still tracked survives a `.gitignore` entry added after the fact,
 * the same alert `agenteq sync` itself raises once it finishes writing.
 */
export default async function findTrackedArtifactsAction(
    options: FindTrackedArtifactsOptions,
): Promise<DoctorFinding[]> {
    const { context } = options;

    const savedAgents = await resolveSavedAgentsAction({ context: context });

    if (!savedAgents) {
        return [];
    }

    const relPaths = savedAgents.flatMap(generatedPathsFor);

    const trackedPaths = git.trackedPaths({
        cwd: context.cwd,
        relPaths: relPaths,
    });

    return [...trackedPaths].map(
        (relPath) =>
            new DoctorFinding({
                fixCommand: `git rm -r --cached ${relPath}`,
                message: `Generated artifact "${relPath}" is tracked by git. Running \`agenteq sync\` already keeps it in .gitignore going forward.`,
            }),
    );
}

/*
 * Interface & Types.
 */

interface FindTrackedArtifactsOptions {
    context: RunContext;
}

/*
 * Internal.
 */

function generatedPathsFor(agent: Agent): string[] {
    return [agent.guidelinesPath, agent.commandsDir, agent.skillsDir].filter(
        (path): path is string => path !== undefined,
    );
}
