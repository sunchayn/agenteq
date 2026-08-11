import { resolve } from "node:path";
import { expandPath } from "@support/utils/expand-path.js";
import filesystem from "@infrastructure/filesystem.js";
import shell from "@infrastructure/shell.js";
import type { DetectionConfiguration } from "@agents/types/detection-configuration.js";
import { agentDefinitions } from "@agents/registry.js";
import { AgentStatus } from "@agents/data-transfer-objects/agent-status.js";

/**
 * Runs detection for every registered agent.
 * Returns a list of all supported agents and whether they are currently detected or not.
 */
export default async function detectAgentsAction(
    options: DetectAgentsOptions,
): Promise<AgentStatus[]> {
    const { cwd } = options;

    return Promise.all(
        agentDefinitions.map(async (agent) => {
            const [isSystemInstalled, isProjectInstalled] = await Promise.all([
                isAgentDetectedUsing({
                    config: agent.detectSystemPathUsing(process.platform),
                    cwd: cwd,
                }),
                isAgentDetectedUsing({
                    config: agent.detectProjectPathUsing(),
                    cwd: cwd,
                }),
            ]);

            return new AgentStatus({
                agent: agent,
                isProjectInstalled: isProjectInstalled,
                isSystemInstalled: isSystemInstalled,
            });
        }),
    );
}

/*
 * Interface & Types.
 */

interface DetectAgentsOptions {
    cwd: string;
}

/*
 * Internal.
 */

interface MatchesDetectionConfigOptions {
    config: DetectionConfiguration;
    cwd: string;
}

/**
 * Checks whether a single agent's DetectionConfig matches on this machine or in this project.
 */
async function isAgentDetectedUsing(
    options: MatchesDetectionConfigOptions,
): Promise<boolean> {
    const { config, cwd } = options;

    for (const command of config.commands) {
        if (await shell.commandExistsOnPath(command)) {
            return true;
        }
    }

    for (const path of config.paths) {
        if (await pathExists(resolve(cwd, expandPath(path)))) {
            return true;
        }
    }

    for (const file of config.files) {
        if (await filesystem.exists(resolve(cwd, expandPath(file)))) {
            return true;
        }
    }

    return false;
}

async function pathExists(absolutePath: string): Promise<boolean> {
    if (!absolutePath.includes("*")) {
        return filesystem.exists(absolutePath);
    }

    // fast-glob requires forward-slash patterns, even on Windows.
    const matches = await filesystem.glob({
        onlyDirectories: true,
        pattern: absolutePath.replace(/\\/g, "/"),
    });

    return matches.length > 0;
}
