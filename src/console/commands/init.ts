import type { Command } from "commander";
import input from "@infrastructure/terminal/input.js";
import detectAgentsAction from "@agents/actions/detect-agents-action.js";
import resolveSavedAgentsAction from "@agents/actions/resolve-saved-agents-action.js";
import saveAgentsFileAction from "@agents/actions/save-agents-file-action.js";
import resolveAgentsByNameAction from "@agents/actions/resolve-agents-by-name-action.js";
import artifactsManager from "@artifacts/services/artifacts-manager/index.js";
import syncArtifactsAction from "@console/actions/sync-artifacts-action.js";
import { printMessage } from "@console/utils/console.js";
import { resolveCapabilitiesToSync } from "@console/utils/artifacts.js";
import {
    resolveCommonSyncOptions,
    type ResolvedSyncOptions,
} from "@console/utils/sync-command.js";
import type { RunContext } from "@shared/types/run-context.js";
import type Agent from "@agents/entities/agent.js";
import type { RawSyncOptions } from "@console/utils/console.js";
import { agentDefinitions } from "@agents/registry.js";
import type { AgentStatus } from "@agents/data-transfer-objects/agent-status.js";

/**
 * Registers `agenteq init`.
 *
 * Prompts for the agent selection, saves the choice, and runs an initial sync.
 * Falls back to auto-detected agents when run non-interactively.
 */
export function registerInitCommand(program: Command): void {
    program
        .command("init")
        .description(
            "Pick which AI agents to use, save the choice, and run an initial sync",
        )
        .option(
            "--only <capabilities>",
            "comma-separated subset of mcp,commands,skills,guidelines (env: AGENTEQ_ONLY)",
        )
        .option(
            "--agents <agents>",
            "comma-separated agent keys to use and sync, skips the picker (env: AGENTEQ_AGENTS)",
        )
        .option("--yes", "run non-interactively (env: AGENTEQ_YES)")
        .option(
            "--json",
            "print machine-readable JSON instead of a table (env: AGENTEQ_JSON)",
        )
        .option(
            "--source-dir <dir>",
            `canonical source directory to sync from (env: AGENTEQ_SOURCE_DIR, default: ${artifactsManager.DEFAULT_SOURCE_DIR})`,
        )
        .action(runInit);
}

/**
 * The command's actual body.
 * It is exported so that `agenteq sync` can invoke it directly when it needs to fall back to initialization.
 */
export async function runInit(rawOptions: RawSyncOptions): Promise<void> {
    const options = resolveCommonSyncOptions(rawOptions);

    const context = {
        cwd: process.cwd(),
        sourceDir: options.sourceDir,
    };

    const agents = await resolveAgentsToTarget(context, options);

    const { capabilities } = await resolveCapabilitiesToSync({
        context: context,
        only: options.only,
    });

    if (agents.length === 0) {
        process.exitCode = 1;

        printMessage({
            isJson: options.isJson,
            level: "error",
            message: "No agents selected. Nothing to configure.",
        });

        return;
    }

    await saveAgentsFileAction({
        agentNames: agents.map((agent) => agent.name),
        capabilities: capabilities,
        context: context,
    });

    const hasFailed = await syncArtifactsAction({
        agents: agents,
        capabilities: capabilities,
        context: context,
        isJson: options.isJson,
        label: "agenteq init",
    });

    process.exitCode = hasFailed ? 1 : 0;
}

/*
 * Interface & Types.
 */

interface PromptForAgentsOptions {
    agents: AgentStatus[];
    preselectedAgents: string[];
}
/*
 * Internal.
 */

async function resolveAgentsToTarget(
    context: RunContext,
    options: ResolvedSyncOptions,
): Promise<Agent[]> {
    // An explicit --agents flag is the strongest signal of intent, so it always wins.
    if (options.agents.length > 0) {
        return resolveAgentsByNameAction(options.agents);
    }

    const savedAgents = await resolveSavedAgentsAction({ context: context });

    // Without a prompt (non-interactive), a prior explicit choice is more relevant than a fresh auto-detection.
    // In other terms, skip detecting if `init` is called non-interactively and there was a previous initialization.
    if (!allowsInteraction(options) && savedAgents) {
        return savedAgents;
    }

    const detectedAgents = await detectAgentsAction({ cwd: context.cwd });

    const installedAgents = findInstalledAgentFrom(detectedAgents);

    // An interactive terminal can ask the user directly, so it overpowers any inferred default.
    // Saved and auto-detected agents are used as pre-selections in the prompt.
    if (allowsInteraction(options)) {
        return promptUserForAgents(
            detectedAgents,
            savedAgents ?? [],
            installedAgents,
        );
    }

    if (installedAgents.length > 0) {
        return installedAgents;
    }

    warnNoInstalledAgentsDetected(options.isJson);

    return [];
}

async function promptUserForAgents(
    agents: AgentStatus[],
    savedAgents: Agent[],
    detectedAgents: Agent[],
): Promise<Agent[]> {
    const preselected = [
        ...new Set([
            ...detectedAgents.map((agent) => agent.name),
            ...savedAgents.map((agent) => agent.name),
        ]),
    ];

    return (
        (await promptForAgents({
            agents: agents,
            preselectedAgents: preselected,
        })) ?? []
    );
}

function findInstalledAgentFrom(agents: AgentStatus[]): Agent[] {
    return agents
        .filter((status) => status.isInstalled)
        .map((status) => status.agent);
}

/**
 * Shows a multiselect prompt for picking agents.
 * Returns undefined when the user cancels it.
 */
async function promptForAgents(
    options: PromptForAgentsOptions,
): Promise<Agent[] | undefined> {
    const { agents, preselectedAgents } = options;

    const picked = await input.multiselect({
        initialValues: preselectedAgents,
        message: "Select agents to sync",
        options: agents.map((status) => {
            const { agent } = status;

            return {
                label: agent.displayName,
                value: agent.name,
            };
        }),
    });

    if (input.isCancel(picked)) {
        return undefined;
    }

    return picked
        .map((name) =>
            agentDefinitions.find((definition) => definition.name === name),
        )
        .filter((agent): agent is Agent => agent !== undefined);
}

function allowsInteraction(options: ResolvedSyncOptions): boolean {
    return input.isInteractive() && !options.shouldSkipPrompts;
}

/**
 * Prints the standard warning for when detection found nothing and no agents were specified.
 */
function warnNoInstalledAgentsDetected(isJson: boolean): void {
    printMessage({
        isJson: isJson,
        level: "warn",
        message:
            "No installed agents detected and none were specified. Pass --agents <name,...> " +
            '(see "agenteq detect" for available agents), or run interactively to pick from a prompt.',
    });
}
