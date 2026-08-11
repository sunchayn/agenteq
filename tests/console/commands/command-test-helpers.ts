import { readFile } from "node:fs/promises";
import { Command } from "commander";
import claudeCode from "@agents/definitions/claude-code.js";
import { AgentStatus } from "@agents/data-transfer-objects/agent-status.js";
import AgentsFile from "@agents/entities/agents-file.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Builds a fresh Command wired to the given register function.
 * Sets exitOverride so a parse failure throws instead of calling process.exit in the test process.
 */
export function createProgram(register: (program: Command) => void): Command {
    const program = new Command();

    program.exitOverride();
    register(program);

    return program;
}

export function detected(
    ...entries: [agent: typeof claudeCode, isInstalled: boolean][]
): AgentStatus[] {
    return entries.map(
        ([agent, isInstalled]) =>
            new AgentStatus({
                agent: agent,
                isProjectInstalled: false,
                isSystemInstalled: isInstalled,
            }),
    );
}

export async function readAgentsFile(
    context: RunContext,
): Promise<string[] | undefined> {
    try {
        const raw = await readFile(AgentsFile.path(context), "utf8");

        return (JSON.parse(raw) as { agents: string[] }).agents;
    } catch {
        return undefined;
    }
}
