import type Agent from "@agents/entities/agent.js";
import git from "@infrastructure/git.js";
import type { RunContext } from "@shared/types/run-context.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import { SyncPayload } from "@artifacts/data-transfer-objects/sync-payload.js";
import { SyncOutcome } from "@artifacts/data-transfer-objects/sync-outcome.js";
import syncMcpStage from "./stages/sync-mcp-stage.js";
import syncSymlinkCapabilityStage from "./stages/sync-symlink-capability-stage.js";
import syncGuidelinesStage from "./stages/sync-guidelines-stage.js";

/**
 * Manages the entire sync life-cycle for every capability.
 */
export default {
    /**
     * The canonical source directory agenteq reads content from and persists its own state under.
     */
    DEFAULT_SOURCE_DIR: ".ai",
    sync: sync,
};

/*
 * Internal.
 */

/**
 * Runs the run's payload through the mcp, commands, skills, and guidelines sync actions in order,
 * each skipping itself when its capability was not requested, without stopping at the first failure.
 */
async function sync(options: SyncOptions): Promise<SyncOutcome> {
    const { capabilities, context, selectedAgents } = options;

    let payload = new SyncPayload({
        capabilities: capabilities,
        context: context,
        selectedAgents: selectedAgents,
    });

    // Each stage reads only the previous's stage payload's original inputs and appends its own results.
    payload = await syncMcpStage(payload);
    payload = await syncSymlinkCapabilityStage(
        AgentCapability.Commands,
        payload,
    );

    payload = await syncSymlinkCapabilityStage(AgentCapability.Skills, payload);
    payload = await syncGuidelinesStage(payload);

    const gitignoreAlerts = git.trackedPaths({
        cwd: context.cwd,
        relPaths: payload.artifactPaths,
    });

    return new SyncOutcome({
        gitignoreAlerts: [...gitignoreAlerts],
        results: payload.results,
        sourceDir: context.sourceDir,
    });
}

/*
 * Interface & Types.
 */

interface SyncOptions {
    context: RunContext;
    selectedAgents: Agent[];
    capabilities: AgentCapability[];
}
