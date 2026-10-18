import type Agent from "@agents/entities/agent.js";
import git from "@infrastructure/git.js";
import type { RunContext } from "@shared/types/run-context.js";
import { CliError } from "@support/errors/cli-error.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import { SyncPayload } from "@artifacts/data-transfer-objects/sync-payload.js";
import { SyncOutcome } from "@artifacts/data-transfer-objects/sync-outcome.js";
import detectHandEditedArtifactsAction from "@artifacts/actions/detect-hand-edited-artifacts-action.js";
import saveSyncManifestFileAction from "@artifacts/actions/save-sync-manifest-file-action.js";
import warmUpBoostProjectStage from "./stages/warm-up-boost-project-stage.js";
import resolveRemoteSourcesStage from "./stages/resolve-remote-sources-stage.js";
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
 * Stops before writing anything when a previously synced artifact was edited by hand since then.
 * Pass `shouldForce` to overwrite anyway.
 */
async function sync(options: SyncOptions): Promise<SyncOutcome> {
    const { capabilities, context, isCopyMode, selectedAgents, shouldForce } =
        options;

    if (!shouldForce) {
        await guardAgainstHandEditedArtifacts(context);
    }

    let payload = new SyncPayload({
        capabilities: capabilities,
        context: context,
        isCopyMode: isCopyMode,
        selectedAgents: selectedAgents,
    });

    // Each stage reads only the previous's stage payload's original inputs and appends its own results.
    payload = await resolveRemoteSourcesStage(payload);
    payload = await warmUpBoostProjectStage(payload);
    payload = await syncMcpStage(payload);
    payload = await syncSymlinkCapabilityStage(
        AgentCapability.Commands,
        payload,
    );

    payload = await syncSymlinkCapabilityStage(AgentCapability.Skills, payload);
    payload = await syncGuidelinesStage(payload);

    if (!context.isDryRun) {
        await saveSyncManifestFileAction({
            artifactPaths: payload.artifactPaths,
            context: context,
        });
    }

    const gitignoreAlerts = git.trackedPaths({
        cwd: context.cwd,
        relPaths: payload.artifactPaths,
    });

    return new SyncOutcome({
        gitignoreAlerts: [...gitignoreAlerts],
        remoteSourceWarnings: payload.remoteSourceWarnings,
        requestedCapabilities: capabilities,
        results: payload.results,
        sourceDir: context.sourceDir,
    });
}

/**
 * Throws a trackable error listing every artifact edited by hand since the last sync.
 * Runs before any stage gets the chance to overwrite one of them.
 */
async function guardAgainstHandEditedArtifacts(
    context: RunContext,
): Promise<void> {
    const editedPaths = await detectHandEditedArtifactsAction({
        context: context,
    });

    if (editedPaths.length === 0) {
        return;
    }

    throw new CliError(
        "E_HAND_EDITED_ARTIFACTS",
        `The following file(s) were edited by hand since the last sync, so sync stopped before overwriting them: ${editedPaths.join(", ")}. Pass --force to overwrite anyway.`,
    );
}

/*
 * Interface & Types.
 */

interface SyncOptions {
    context: RunContext;
    selectedAgents: Agent[];
    capabilities: AgentCapability[];
    isCopyMode?: boolean;
    shouldForce?: boolean;
}
