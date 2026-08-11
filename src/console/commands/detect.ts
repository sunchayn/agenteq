import type { Command } from "commander";
import pc from "picocolors";
import type Agent from "@agents/entities/agent.js";
import detectAgentsAction from "@agents/actions/detect-agents-action.js";
import type { AgentStatus } from "@agents/data-transfer-objects/agent-status.js";
import env from "@infrastructure/env.js";
import output from "@infrastructure/terminal/output.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import {
    printMessage,
    TableData,
    renderAsJson,
} from "@console/utils/console.js";

/**
 * Registers `agenteq detect`.
 * Reports whether each of the supported agents is installed within the system/project.
 */
export function registerDetectCommand(program: Command): void {
    program
        .command("detect")
        .description(
            "Detect which AI coding agents are installed on this system/project.",
        )
        .option(
            "--json",
            "print machine-readable JSON instead of a table (env: AGENTEQ_JSON)",
        )
        .action(async (options: DetectOptions) => {
            const isJson = options.json ?? env.readFlag("AGENTEQ_JSON");

            const agents = await detectAgentsAction({ cwd: process.cwd() });

            if (!agents.some((status) => status.isInstalled)) {
                process.exitCode = 1;

                printMessage({
                    isJson: isJson,
                    level: "error",
                    message: "No installed AI agents are detected.",
                });

                return;
            }

            process.exitCode = 0;

            if (isJson) {
                output.writeRaw(
                    renderAsJson(representAgentsAsRenderableJson(agents)),
                );

                return;
            }

            const { headers, rows } = representAgentsAsTable(agents);

            output.table(headers, rows);
        });
}

/*
 * Interface & Types.
 */

interface DetectOptions {
    json?: boolean;
}

interface RenderableJsonPayload {
    capabilities: AgentCapability[];
    displayName: string;
    name: string;
    projectInstalled: boolean;
    systemInstalled: boolean;
}

/*
 * Internal.
 */

function representAgentsAsRenderableJson(
    agents: AgentStatus[],
): RenderableJsonPayload[] {
    return agents.map((status) => {
        const { agent, isProjectInstalled, isSystemInstalled } = status;

        return {
            capabilities: capabilitiesList(agent),
            displayName: agent.displayName,
            name: agent.name,
            projectInstalled: isProjectInstalled,
            systemInstalled: isSystemInstalled,
        };
    });
}

function representAgentsAsTable(agents: AgentStatus[]): TableData {
    const rows = agents.map((status) => {
        const { agent, isProjectInstalled, isSystemInstalled } = status;

        return [
            agent.displayName,
            pc.dim(agent.name),
            installedCell(isSystemInstalled),
            installedCell(isProjectInstalled),
            capabilitiesList(agent).join(", ") || pc.dim("-"),
        ];
    });

    function installedCell(isInstalled: boolean): string {
        return isInstalled ? pc.green("yes") : pc.dim("no");
    }

    return {
        headers: ["Agent", "Name", "System", "Project", "Capabilities"],
        rows: rows,
    };
}

function capabilitiesList(agent: Agent): AgentCapability[] {
    const capabilities: AgentCapability[] = [];

    if (agent.supportsGuidelines()) {
        capabilities.push(AgentCapability.Guidelines);
    }

    if (agent.supportsSkills()) {
        capabilities.push(AgentCapability.Skills);
    }

    if (agent.supportsMcp()) {
        capabilities.push(AgentCapability.Mcp);
    }

    if (agent.supportsCommands()) {
        capabilities.push(AgentCapability.Commands);
    }

    return capabilities;
}
