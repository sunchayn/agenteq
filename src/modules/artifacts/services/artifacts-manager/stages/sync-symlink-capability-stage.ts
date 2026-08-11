import { dirname, join } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import git from "@infrastructure/git.js";
import type Agent from "@agents/entities/agent.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import { SyncStatus } from "@artifacts/enums/sync-status.js";
import type { SyncResult } from "@artifacts/types/sync-result.js";
import { SyncPayload } from "@artifacts/data-transfer-objects/sync-payload.js";

/**
 * Reusable sync stage to mirror one symlink-configured capability, commands or skills,
 * from its canonical source directory into every selected agent that declares it.
 */
export default async function syncSymlinkCapabilityStage(
    capability: AgentCapability.Commands | AgentCapability.Skills,
    payload: SyncPayload,
): Promise<SyncPayload> {
    if (!payload.wantsCapability(capability)) {
        return payload;
    }

    const { artifactPaths, results } = await syncAgents(capability, payload);

    return payload.withResults(results, artifactPaths);
}

/*
 * Interface & Types.
 */

interface MirrorDirOptions {
    sourceDir: string;
    targetDir: string;
    renameFile?: (file: string) => string;
}

interface SyncAgentsResult {
    results: SyncResult[];
    artifactPaths: string[];
}

/*
 * Internal.
 */

async function syncAgents(
    capability: AgentCapability.Commands | AgentCapability.Skills,
    payload: SyncPayload,
): Promise<SyncAgentsResult> {
    const source = sourceDirFor(
        capability,
        payload.context.cwd,
        payload.context.sourceDir,
    );

    if (!(await filesystem.exists(source))) {
        return { artifactPaths: [], results: [] };
    }

    const results: SyncResult[] = [];
    const artifactPaths: string[] = [];

    for (const agent of payload.selectedAgents) {
        const targetRelDir = targetDirFor(capability, agent);

        if (!targetRelDir) {
            results.push({
                agent: agent.displayName,
                capability: capability,
                item: "(not supported)",
                status: SyncStatus.Unsupported,
            });

            continue;
        }

        let status = SyncStatus.Written;
        let count = 0;
        let item = "failed";
        let detail: string | undefined;

        // Only commands ever need renaming, e.g. Copilot's ".prompt.md" requirement, since skills always keep the fixed "SKILL.md" filename.
        const commandsFileExtension = agent.commandsFileExtension;

        const renameFile =
            capability === AgentCapability.Commands && commandsFileExtension
                ? (file: string) => file.replace(/\.md$/, commandsFileExtension)
                : undefined;

        try {
            count = await mirrorDir({
                renameFile: renameFile,
                sourceDir: source,
                targetDir: join(payload.context.cwd, targetRelDir),
            });

            item = `${count} file(s)`;
        } catch (error) {
            status = SyncStatus.Failed;
            detail = (error as Error).message;
        }

        if (status === SyncStatus.Written && count > 0) {
            await git.ignore({
                cwd: payload.context.cwd,
                relPath: targetRelDir,
            });

            artifactPaths.push(targetRelDir);
        }

        results.push({
            agent: agent.displayName,
            capability: capability,
            detail: detail,
            item: item,
            status: status,
        });
    }

    return { artifactPaths: artifactPaths, results: results };
}

function sourceDirFor(
    capability: AgentCapability.Commands | AgentCapability.Skills,
    cwd: string,
    canonicalDir: string,
): string {
    return join(
        cwd,
        canonicalDir,
        capability === AgentCapability.Commands ? "commands" : "skills",
    );
}

function targetDirFor(
    capability: AgentCapability.Commands | AgentCapability.Skills,
    agent: Agent,
): string | undefined {
    return capability === AgentCapability.Commands
        ? agent.commandsDir
        : agent.skillsDir;
}

/**
 * Mirrors every source file into the target directory via symlinks.
 */
async function mirrorDir(options: MirrorDirOptions): Promise<number> {
    const { renameFile, sourceDir, targetDir } = options;

    // Only symlinks pointing into sourceDir are cleared before repopulating,
    // so a real file the agent or the user placed in targetDir is left untouched.
    await filesystem.removeSymlinksInto({
        sourceDir: sourceDir,
        targetDir: targetDir,
    });

    const files = await filesystem.glob({
        cwd: sourceDir,
        dot: true,
        onlyFiles: true,
        pattern: "**/*",
    });

    for (const file of files) {
        const link = join(targetDir, renameFile ? renameFile(file) : file);
        const source = join(sourceDir, file);

        await filesystem.mkdir(dirname(link));
        await filesystem.symlinkOrCopy({ source: source, target: link });
    }

    return files.length;
}
