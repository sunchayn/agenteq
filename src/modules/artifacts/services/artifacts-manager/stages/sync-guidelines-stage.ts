import { dirname, join, relative } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import git from "@infrastructure/git.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import { SyncStatus } from "@artifacts/enums/sync-status.js";
import { guidelinesSuffix } from "@artifacts/services/artifacts-manager/stubs/guidelines-suffix.js";
import {
    resolveRemoteGuidelinesPath,
    type RemoteGuidelinesResolution,
} from "@artifacts/actions/discover-remote-capabilities-action.js";
import type { SyncResult } from "@artifacts/types/sync-result.js";
import { SyncPayload } from "@artifacts/data-transfer-objects/sync-payload.js";

/**
 * Writes GUIDELINES.md into every selected agent that declares it.
 */
export default async function syncGuidelinesStage(
    payload: SyncPayload,
): Promise<SyncPayload> {
    if (!payload.wantsCapability(AgentCapability.Guidelines)) {
        return payload;
    }

    const { artifactPaths, rows, warnings } = await syncAgents(payload);

    const warnedPayload = warnings.reduce(
        (current, warning) => current.withRemoteSourceWarning(warning),
        payload,
    );

    return warnedPayload.withResults(rows, artifactPaths);
}

/*
 * Interface & Types.
 */

interface WriteGuidelinesOptions {
    sourcePath: string;
    remoteSourcePaths: string[];
    remoteUrls: string[];
    guidelinesPath: string;
    targetCwd: string;
    boostGuidelines?: string;
    referenceAnnotationTable?: string;
    isDryRun?: boolean;
}

interface SyncAgentsResult {
    rows: SyncResult[];
    artifactPaths: string[];
    warnings: string[];
}

interface WriteGuidelinesResult {
    status: SyncStatus;
    detail?: string;
}

/*
 * Internal.
 */

async function syncAgents(payload: SyncPayload): Promise<SyncAgentsResult> {
    const source = join(
        payload.context.cwd,
        payload.context.sourceDir,
        "GUIDELINES.md",
    );

    const hasSource = await filesystem.exists(source);

    const remotesWithGuidelines = payload.remoteSources.filter(
        (remote) => remote.selection.guidelines,
    );

    const remoteGuidelinesResolutions = await Promise.all(
        remotesWithGuidelines.map((remote) =>
            resolveRemoteGuidelinesPath(remote.rootDir),
        ),
    );

    const remoteSourcePaths = remoteGuidelinesResolutions.map(
        (resolution, index) =>
            resolution.path ??
            join(remotesWithGuidelines[index].rootDir, "GUIDELINES.md"),
    );

    const guidelinesWarnings = remotesWithGuidelines.flatMap(
        (remote, index) =>
            warningsForGuidelinesConflict(
                remote.name,
                remote.rootDir,
                remoteGuidelinesResolutions[index],
            ),
    );

    const remoteUrls = remotesWithGuidelines.map((remote) => remote.url);

    // A Boost-sourced block or a reference mapping table still needs distributing,
    // even with no hand-authored GUIDELINES.md file in place yet.
    if (
        !hasSource &&
        !payload.boostGuidelines &&
        !payload.referenceAnnotationTable &&
        remoteSourcePaths.length === 0
    ) {
        return { artifactPaths: [], rows: [], warnings: guidelinesWarnings };
    }

    const results: SyncResult[] = [];
    const artifactPaths: string[] = [];

    for (const agent of payload.selectedAgents) {
        if (!agent.guidelinesPath) {
            results.push({
                agent: agent.displayName,
                capability: AgentCapability.Guidelines,
                item: "(not supported)",
                status: SyncStatus.Unsupported,
            });

            continue;
        }

        const { detail, status } = await writeGuidelines({
            boostGuidelines: payload.boostGuidelines,
            guidelinesPath: agent.guidelinesPath,
            isDryRun: payload.context.isDryRun,
            referenceAnnotationTable: payload.referenceAnnotationTable,
            remoteSourcePaths: remoteSourcePaths,
            remoteUrls: remoteUrls,
            sourcePath: source,
            targetCwd: payload.context.cwd,
        });

        if (status === SyncStatus.Written) {
            // A dry run only reports the status, it never touches .gitignore.
            if (!payload.context.isDryRun) {
                await git.ignore({
                    cwd: payload.context.cwd,
                    relPath: agent.guidelinesPath,
                });
            }

            artifactPaths.push(agent.guidelinesPath);
        }

        results.push({
            agent: agent.displayName,
            capability: AgentCapability.Guidelines,
            detail: detail,
            item: agent.guidelinesPath,
            status: status,
        });
    }

    return {
        artifactPaths: artifactPaths,
        rows: results,
        warnings: guidelinesWarnings,
    };
}

/**
 * Warns when a remote carries multiple GUIDELINES.md in root and pseudo-root folders.
 */
function warningsForGuidelinesConflict(
    remoteName: string,
    rootDir: string,
    resolution: RemoteGuidelinesResolution,
): string[] {
    const { ignoredPaths, path } = resolution;

    if (ignoredPaths.length === 0 || !path) {
        return [];
    }

    const usedLabel = relative(rootDir, path);

    const ignoredLabels = ignoredPaths
        .map((ignoredPath) => relative(rootDir, ignoredPath))
        .join(", ");

    return [
        `Remote source "${remoteName}" has GUIDELINES.md in more than one place, using ${usedLabel} and ignoring ${ignoredLabels}.`,
    ];
}

/**
 * Writes the canonical guidelines file into one agent's guidelines path.
 * Always a real file, never a symlink, the written content never matches the source (some content is dynamic).
 * A dry run builds the same content to validate it, but skips the actual write.
 */
async function writeGuidelines(
    options: WriteGuidelinesOptions,
): Promise<WriteGuidelinesResult> {
    const {
        boostGuidelines,
        guidelinesPath,
        isDryRun,
        referenceAnnotationTable,
        remoteSourcePaths,
        remoteUrls,
        sourcePath,
        targetCwd,
    } = options;

    const target = join(targetCwd, guidelinesPath);

    try {
        const raw = (await filesystem.readFile(sourcePath)) ?? "";

        const remoteBlocks = await Promise.all(
            remoteSourcePaths.map(
                async (path) => (await filesystem.readFile(path)) ?? "",
            ),
        );

        const remoteBlock = remoteBlocks
            .filter((block) => block.length > 0)
            .map((block) => `${block}\n\n`)
            .join("");

        const boostBlock = boostGuidelines
            ? `\n\n<laravel-boost-guidelines>\n${boostGuidelines}\n\n</laravel-boost-guidelines>\n`
            : "";

        const content = `${remoteBlock}${raw}${boostBlock}${referenceAnnotationTable ?? ""}${guidelinesSuffix({ remoteUrls: remoteUrls })}`;

        if (!isDryRun) {
            await filesystem.mkdir(dirname(target));

            await filesystem.writeFile({ content: content, path: target });
        }

        return { status: SyncStatus.Written };
    } catch (error) {
        return { detail: (error as Error).message, status: SyncStatus.Failed };
    }
}
