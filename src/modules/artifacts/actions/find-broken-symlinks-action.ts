import { join } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import resolveSavedAgentsAction from "@agents/actions/resolve-saved-agents-action.js";
import type Agent from "@agents/entities/agent.js";
import { DoctorFinding } from "@shared/data-transfer-objects/doctor-finding.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Checks every saved agent's commands and skills directories for a symlink that no longer resolves,
 * for example one left behind by a remote source or a canonical source file that was since removed.
 */
export default async function findBrokenSymlinksAction(
    options: FindBrokenSymlinksOptions,
): Promise<DoctorFinding[]> {
    const { context } = options;

    const savedAgents = await resolveSavedAgentsAction({ context: context });

    if (!savedAgents) {
        return [];
    }

    const findings: DoctorFinding[] = [];

    for (const agent of savedAgents) {
        for (const targetRelDir of symlinkDirsFor(agent)) {
            findings.push(
                ...(await findBrokenSymlinksIn(
                    context.cwd,
                    targetRelDir,
                    agent,
                )),
            );
        }
    }

    return findings;
}

/*
 * Interface & Types.
 */

interface FindBrokenSymlinksOptions {
    context: RunContext;
}

/*
 * Internal.
 */

function symlinkDirsFor(agent: Agent): string[] {
    return [agent.commandsDir, agent.skillsDir].filter(
        (dir): dir is string => dir !== undefined,
    );
}

async function findBrokenSymlinksIn(
    cwd: string,
    targetRelDir: string,
    agent: Agent,
): Promise<DoctorFinding[]> {
    const brokenLinks = await filesystem.findBrokenSymlinks(
        join(cwd, targetRelDir),
    );

    return brokenLinks.map(
        (brokenRelPath) =>
            new DoctorFinding({
                fixCommand: "agenteq sync",
                message: `${agent.displayName}'s symlink at ${join(targetRelDir, brokenRelPath)} no longer resolves.`,
            }),
    );
}
