import { dirname, join } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import git from "@infrastructure/git.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import { SyncStatus } from "@artifacts/enums/sync-status.js";
import { GUIDELINES_SUFFIX } from "@artifacts/services/artifacts-manager/stubs/guidelines-suffix.js";
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

    const { artifactPaths, rows } = await syncAgents(payload);

    return payload.withResults(rows, artifactPaths);
}

/*
 * Interface & Types.
 */

interface WriteGuidelinesOptions {
    sourcePath: string;
    guidelinesPath: string;
    targetCwd: string;
}

interface SyncAgentsResult {
    rows: SyncResult[];
    artifactPaths: string[];
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

    if (!(await filesystem.exists(source))) {
        return { artifactPaths: [], rows: [] };
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
            guidelinesPath: agent.guidelinesPath,
            sourcePath: source,
            targetCwd: payload.context.cwd,
        });

        if (status === SyncStatus.Written) {
            await git.ignore({
                cwd: payload.context.cwd,
                relPath: agent.guidelinesPath,
            });

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

    return { artifactPaths: artifactPaths, rows: results };
}

/**
 * Writes the canonical guidelines file into one agent's guidelines path.
 * Always a real file, never a symlink, the written content never matches the source (some content is dynamic).
 */
async function writeGuidelines(
    options: WriteGuidelinesOptions,
): Promise<WriteGuidelinesResult> {
    const { guidelinesPath, sourcePath, targetCwd } = options;

    const target = join(targetCwd, guidelinesPath);

    try {
        const raw = (await filesystem.readFile(sourcePath)) ?? "";

        const content = `${raw}${GUIDELINES_SUFFIX}`;

        await filesystem.mkdir(dirname(target));

        await filesystem.writeFile({ content: content, path: target });

        return { status: SyncStatus.Written };
    } catch (error) {
        return { detail: (error as Error).message, status: SyncStatus.Failed };
    }
}
