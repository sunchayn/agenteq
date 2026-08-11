import { CliError } from "@support/errors/cli-error.js";
import { agentDefinitions } from "@agents/registry.js";
import type Agent from "@agents/entities/agent.js";

/**
 * Maps agent's name strings to Agent objects,
 * throwing on any name that isn't a registered agent.
 */
export default function resolveAgentsByNameAction(names: string[]): Agent[] {
    return names.map((name) => {
        const agent = agentDefinitions.find(
            (definition) => definition.name === name,
        );

        if (!agent) {
            throw new CliError("E_UNKNOWN_AGENT", `Unknown agent "${name}".`);
        }

        return agent;
    });
}
