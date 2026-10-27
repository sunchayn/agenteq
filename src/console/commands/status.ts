import type { Command } from "commander";
import git from "@infrastructure/git.js";
import env from "@infrastructure/env.js";
import output from "@infrastructure/terminal/output.js";
import artifactsManager from "@artifacts/services/artifacts-manager/index.js";
import loadAgentsFileAction from "@agents/actions/load-agents-file-action.js";
import loadRemoteSourcesFileAction from "@artifacts/actions/load-remote-sources-file-action.js";
import loadSyncManifestFileAction from "@artifacts/actions/load-sync-manifest-file-action.js";
import detectHandEditedArtifactsAction from "@artifacts/actions/detect-hand-edited-artifacts-action.js";
import { defaultClonePathFor } from "@support/utils/agenteq-sources-root.js";
import { renderAsJson } from "@console/utils/console.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Registers `agenteq status`.
 * Reports the current sync state, configured agents, remote sources and their commit,
 * artifacts edited by hand since the last sync, and generated artifacts tracked by git,
 * without touching anything on disk.
 */
export function registerStatusCommand(program: Command): void {
    program
        .command("status")
        .description(
            "Show the configured agents, remote sources, and sync drift without touching anything",
        )
        .option(
            "--json",
            "print machine-readable JSON instead of text (env: AGENTEQ_JSON)",
        )
        .option(
            "--source-dir <dir>",
            `canonical source directory to read from (env: AGENTEQ_SOURCE_DIR, default: ${artifactsManager.DEFAULT_SOURCE_DIR})`,
        )
        .action(async (rawOptions: StatusOptions) => {
            const options = resolveOptions(rawOptions);
            const context = { cwd: process.cwd(), sourceDir: options.sourceDir };

            const status = await buildStatus(context);

            if (options.isJson) {
                output.writeRaw(renderAsJson(status));

                return;
            }

            renderStatusAsText(status);
        });
}

/*
 * Interface & Types.
 */

interface StatusOptions {
    json?: boolean;
    sourceDir?: string;
}

interface RemoteSourceStatus {
    name: string;
    url: string;
    pinned: string | undefined;
    commit: string | undefined;
}

interface Status {
    agents: string[];
    remoteSources: RemoteSourceStatus[];
    handEditedArtifacts: string[];
    trackedArtifacts: string[];
}

interface ResolvedStatusOptions {
    isJson: boolean;
    sourceDir: string;
}

/*
 * Internal.
 */

function resolveOptions(rawOptions: StatusOptions): ResolvedStatusOptions {
    return {
        isJson: rawOptions.json ?? env.readFlag("AGENTEQ_JSON"),
        sourceDir:
            rawOptions.sourceDir ??
            env.readString("AGENTEQ_SOURCE_DIR") ??
            artifactsManager.DEFAULT_SOURCE_DIR,
    };
}

async function buildStatus(context: RunContext): Promise<Status> {
    const agentsFile = await loadAgentsFileAction({ context: context });

    const remoteSourcesFile = await loadRemoteSourcesFileAction({
        context: context,
    });

    const manifest = await loadSyncManifestFileAction({ context: context });

    const handEditedArtifacts = await detectHandEditedArtifactsAction({
        context: context,
    });

    const trackedArtifacts = git.trackedPaths({
        cwd: context.cwd,
        relPaths: Object.keys(manifest.hashesByPath),
    });

    const remoteSources = remoteSourcesFile.names().map((name) => {
        const entry = remoteSourcesFile.get(name);

        const clonePath =
            agentsFile?.clonePathOf(name) ?? defaultClonePathFor(name);

        return {
            commit: git.currentCommit({ cwd: clonePath }),
            name: name,
            pinned: entry?.ref,
            url: entry?.url ?? "",
        };
    });

    return {
        agents: agentsFile?.agentNames ?? [],
        handEditedArtifacts: handEditedArtifacts,
        remoteSources: remoteSources,
        trackedArtifacts: [...trackedArtifacts],
    };
}

function renderStatusAsText(status: Status): void {
    output.info(
        status.agents.length > 0
            ? `Agents: ${status.agents.join(", ")}`
            : "Agents: none configured.",
    );

    if (status.remoteSources.length > 0) {
        output.table(
            ["Name", "URL", "Pinned", "Commit"],
            status.remoteSources.map((remote) => [
                remote.name,
                remote.url,
                remote.pinned ?? "tracking",
                remote.commit ?? "unknown",
            ]),
        );
    } else {
        output.info("Remote sources: none configured.");
    }

    if (status.handEditedArtifacts.length > 0) {
        output.warn(
            `Edited by hand since the last sync: ${status.handEditedArtifacts.join(", ")}`,
        );
    }

    if (status.trackedArtifacts.length > 0) {
        output.warn(
            `Generated artifacts tracked by git: ${status.trackedArtifacts.join(", ")}`,
        );
    }
}
