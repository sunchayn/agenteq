import type { Command } from "commander";
import output from "@infrastructure/terminal/output.js";
import resolveSavedAgentsAction from "@agents/actions/resolve-saved-agents-action.js";
import saveAgentsFileAction from "@agents/actions/save-agents-file-action.js";
import resolveAgentsByNameAction from "@agents/actions/resolve-agents-by-name-action.js";
import artifactsManager from "@artifacts/services/artifacts-manager/index.js";
import syncArtifactsAction from "@console/actions/sync-artifacts-action.js";
import { runInit } from "@console/commands/init.js";
import { printMessage } from "@console/utils/console.js";
import { resolveCapabilitiesToSync } from "@console/utils/artifacts.js";
import { resolveCommonSyncOptions } from "@console/utils/sync-command.js";
import type { RunContext } from "@shared/types/run-context.js";
import type Agent from "@agents/entities/agent.js";
import type { RawSyncOptions } from "@console/utils/console.js";

/**
 * Registers `agenteq sync`.
 *
 * Sync the AI artifacts based on the saved configuration (from `agenteq init` run).
 * If no configuration is detected, it delegates to `agenteq init` to build it.
 */
export function registerSyncCommand(program: Command): void {
    program
        .command("sync")
        .description(
            "Sync MCP servers, commands, skills, and guidelines into every selected agent",
        )
        .option(
            "--only <capabilities>",
            "comma-separated subset of mcp,commands,skills,guidelines (env: AGENTEQ_ONLY)",
        )
        .option(
            "--agents <agents>",
            "comma-separated agent keys to sync, skips detection prompt (env: AGENTEQ_AGENTS)",
        )
        .option(
            "--yes",
            "run non-interactively, syncing all detected agents (env: AGENTEQ_YES)",
        )
        .option(
            "--json",
            "print machine-readable JSON instead of a table (env: AGENTEQ_JSON)",
        )
        .option(
            "--source-dir <dir>",
            `canonical source directory to sync from (env: AGENTEQ_SOURCE_DIR, default: ${artifactsManager.DEFAULT_SOURCE_DIR})`,
        )
        .action(async (rawOptions: RawSyncOptions) => {
            const options = resolveCommonSyncOptions(rawOptions);

            const context = {
                cwd: process.cwd(),
                sourceDir: options.sourceDir,
            };

            const agentsToSync = await resolveAgentsToSync(
                context,
                options.agents,
            );

            if (!agentsToSync) {
                printMessage({
                    isJson: options.isJson,
                    level: "info",
                    message:
                        "Project is not initialized. Running `agenteq init` instead.",
                });

                await runInit(rawOptions);

                return;
            }

            const { agents, isDirty: userProvidedAgentListExplicitly } =
                agentsToSync;

            if (agents.length === 0) {
                process.exitCode = 0;

                printMessage({
                    isJson: options.isJson,
                    level: "error",
                    message: "No agents selected. Nothing to sync.",
                });

                return;
            }

            // Only announced when agents come from the saved file (not explicitly provided by with `--agents`).
            if (!options.isJson && !userProvidedAgentListExplicitly) {
                announceSavedAgents(agents);
            }

            const {
                capabilities,
                isDirty: userProvidedCapabilitiesListExplicitly,
            } = await resolveCapabilitiesToSync({
                context: context,
                only: options.only,
            });

            // Reflect the user's choice with the command arguments on the saved agents file for future uses.
            if (
                userProvidedAgentListExplicitly ||
                userProvidedCapabilitiesListExplicitly
            ) {
                await saveAgentsFileAction({
                    agentNames: agents.map((agent) => agent.name),
                    capabilities: capabilities,
                    context: context,
                });
            }

            const hasFailed = await syncArtifactsAction({
                agents: agents,
                capabilities: capabilities,
                context: context,
                isJson: options.isJson,
                label: "agenteq sync",
            });

            process.exitCode = hasFailed ? 1 : 0;
        });
}

/*
 * Interface & Types.
 */

interface ResolvedAgents {
    agents: Agent[];
    isDirty: boolean;
}

/*
 * Internal.
 */

/**
 * Resolves agents from `--agents`, then the saved agents file.
 * Returns undefined when neither is available, so the caller can hand off to `agenteq init`.
 */
async function resolveAgentsToSync(
    context: RunContext,
    preferredAgents: string[],
): Promise<ResolvedAgents | undefined> {
    if (preferredAgents.length > 0) {
        return {
            agents: resolveAgentsByNameAction(preferredAgents),
            isDirty: true,
        };
    }

    const saved = await resolveSavedAgentsAction({ context: context });

    if (!saved) {
        return undefined;
    }

    return { agents: saved, isDirty: false };
}

/**
 * Prints which agents were picked up from the saved agents file.
 */
function announceSavedAgents(agents: Agent[]): void {
    output.info(
        `Using saved agents: ${agents
            .map((agent) => agent.displayName)
            .join(", ")}`,
    );
}
