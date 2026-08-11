import filesystem from "@infrastructure/filesystem.js";
import AgentsFile from "@agents/entities/agents-file.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Reads and parses agenteq's saved agents file.
 */
export default async function loadAgentsFileAction(
    options: LoadAgentsFileOptions,
): Promise<AgentsFile | undefined> {
    const { context } = options;

    const raw = await filesystem.readFile(AgentsFile.path(context));

    return (raw ? AgentsFile.parse(raw) : null) ?? undefined;
}

/*
 * Interface & Types.
 */

interface LoadAgentsFileOptions {
    context: RunContext;
}
