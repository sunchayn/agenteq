import { dirname, join } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import git from "@infrastructure/git.js";
import type Agent from "@agents/entities/agent.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import { SyncStatus } from "@artifacts/enums/sync-status.js";
import type { SyncResult } from "@artifacts/types/sync-result.js";
import { SyncPayload } from "@artifacts/data-transfer-objects/sync-payload.js";
import type { ResolvedRemoteSource } from "@artifacts/data-transfer-objects/sync-payload.js";
import { AGENTEQ_SOURCES_ROOT } from "@support/utils/agenteq-sources-root.js";

/**
 * Reusable sync stage to mirror one symlink-configured capability (commands or skills) into every selected agent.
 * Reads them from the canonical source directory, plus every configured remote source, in order.
 * A local capability always wins a same-key collision, then the first remote to claim a key wins.
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
    filterFiles?: (file: string) => boolean;
}

interface SyncAgentsResult {
    results: SyncResult[];
    artifactPaths: string[];
}

interface RemoteSourceDir {
    name: string;
    dir: string;
    selection: ResolvedRemoteSource["selection"];
}

interface SyncOneAgentOptions {
    agent: Agent;
    capability: AgentCapability.Commands | AgentCapability.Skills;
    cwd: string;
    source: string;
    remoteSourceDirs: RemoteSourceDir[];
    hasLocalSource: boolean;
    targetRelDir: string;
}

interface SyncOneAgentResult {
    result: SyncResult;
    fileCount: number;
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

    const remoteSourceDirs = remoteSourceDirsFor(capability, payload);

    // Runs before the early return below, since a removed remote source leaves nothing else to sync.
    await pruneOrphanedRemoteSymlinks(capability, payload);

    const hasLocalSource = await filesystem.exists(source);

    const hasAnyRemoteSource = (
        await Promise.all(
            remoteSourceDirs.map((remote) => filesystem.exists(remote.dir)),
        )
    ).some(Boolean);

    if (!hasLocalSource && !hasAnyRemoteSource) {
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

        const { fileCount, result } = await syncOneAgent({
            agent: agent,
            capability: capability,
            cwd: payload.context.cwd,
            hasLocalSource: hasLocalSource,
            remoteSourceDirs: remoteSourceDirs,
            source: source,
            targetRelDir: targetRelDir,
        });

        results.push(result);

        if (result.status === SyncStatus.Written && fileCount > 0) {
            await git.ignore({
                cwd: payload.context.cwd,
                relPath: targetRelDir,
            });

            artifactPaths.push(targetRelDir);
        }
    }

    return { artifactPaths: artifactPaths, results: results };
}

/**
 * Prunes every symlink under the default remote-clone root from each selected agent's target dir.
 * Runs silently, since a stale symlink from an unconfigured source isn't worth a result row.
 */
async function pruneOrphanedRemoteSymlinks(
    capability: AgentCapability.Commands | AgentCapability.Skills,
    payload: SyncPayload,
): Promise<void> {
    for (const agent of payload.selectedAgents) {
        const targetRelDir = targetDirFor(capability, agent);

        if (!targetRelDir) {
            continue;
        }

        await filesystem.removeSymlinksInto({
            sourceDir: AGENTEQ_SOURCES_ROOT,
            targetDir: join(payload.context.cwd, targetRelDir),
        });
    }
}

async function syncOneAgent(
    options: SyncOneAgentOptions,
): Promise<SyncOneAgentResult> {
    const {
        agent,
        capability,
        cwd,
        hasLocalSource,
        remoteSourceDirs,
        source,
        targetRelDir,
    } = options;

    const targetDir = join(cwd, targetRelDir);

    // Only commands ever need renaming, e.g. Copilot's ".prompt.md" requirement, since skills always keep the fixed "SKILL.md" filename.
    const commandsFileExtension = agent.commandsFileExtension;

    const renameFile =
        capability === AgentCapability.Commands && commandsFileExtension
            ? (file: string) => file.replace(/\.md$/, commandsFileExtension)
            : undefined;

    try {
        const localFiles = hasLocalSource
            ? await mirrorDir({
                  renameFile: renameFile,
                  sourceDir: source,
                  targetDir: targetDir,
              })
            : [];

        // Local wins first, then each remote in configured order wins over every later one.
        const claimedNames = new Set(localFiles.map(topLevelName));

        let remoteFileCount = 0;

        for (const remote of remoteSourceDirs) {
            const remoteFiles = await mirrorDir({
                filterFiles: remoteFileFilterFor(
                    capability,
                    remote.selection,
                    claimedNames,
                ),
                renameFile: renameFile,
                sourceDir: remote.dir,
                targetDir: targetDir,
            });

            for (const file of remoteFiles) {
                claimedNames.add(topLevelName(file));
            }

            remoteFileCount += remoteFiles.length;
        }

        const fileCount = localFiles.length + remoteFileCount;

        return {
            fileCount: fileCount,
            result: {
                agent: agent.displayName,
                capability: capability,
                item: `${fileCount} file(s)`,
                status: SyncStatus.Written,
            },
        };
    } catch (error) {
        return {
            fileCount: 0,
            result: {
                agent: agent.displayName,
                capability: capability,
                detail: (error as Error).message,
                item: "failed",
                status: SyncStatus.Failed,
            },
        };
    }
}

/**
 * A file is mirrored only when it's in this remote's saved selection.
 * Its top-level name, the skill directory or the command file, must have no local or earlier-remote claim.
 */
function remoteFileFilterFor(
    capability: AgentCapability.Commands | AgentCapability.Skills,
    selection: ResolvedRemoteSource["selection"],
    excludedNames: ReadonlySet<string>,
): (file: string) => boolean {
    const selectedNames = new Set(
        capability === AgentCapability.Skills
            ? selection.skills
            : selection.commands,
    );

    return function (file) {
        if (capability === AgentCapability.Skills) {
            // Skills select and collide by top-level directory name, since a whole skill directory is one unit.
            return (
                selectedNames.has(topLevelName(file)) &&
                !excludedNames.has(topLevelName(file))
            );
        }

        // Commands select and collide by exact file path, since each command is one standalone file.
        return (
            selectedNames.has(file) && !excludedNames.has(topLevelName(file))
        );
    };
}

function topLevelName(file: string): string {
    return file.split("/")[0];
}

function sourceDirFor(
    capability: AgentCapability.Commands | AgentCapability.Skills,
    cwd: string,
    sourceDir: string,
): string {
    return join(
        cwd,
        sourceDir,
        capability === AgentCapability.Commands ? "commands" : "skills",
    );
}

function remoteSourceDirsFor(
    capability: AgentCapability.Commands | AgentCapability.Skills,
    payload: SyncPayload,
): RemoteSourceDir[] {
    return payload.remoteSources.map((remote) => ({
        dir: join(
            remote.rootDir,
            capability === AgentCapability.Commands ? "commands" : "skills",
        ),
        name: remote.name,
        selection: remote.selection,
    }));
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
 * Mirrors every source file into the target directory via symlinks, optionally filtered.
 * Returns the list of files actually mirrored.
 */
async function mirrorDir(options: MirrorDirOptions): Promise<string[]> {
    const { filterFiles, renameFile, sourceDir, targetDir } = options;

    // Only symlinks pointing into sourceDir are cleared before repopulating,
    // so a real file the agent or the user placed in targetDir is left untouched.
    await filesystem.removeSymlinksInto({
        sourceDir: sourceDir,
        targetDir: targetDir,
    });

    const allFiles = await filesystem.glob({
        cwd: sourceDir,
        dot: true,
        onlyFiles: true,
        pattern: "**/*",
    });

    const files = filterFiles ? allFiles.filter(filterFiles) : allFiles;

    for (const file of files) {
        const link = join(targetDir, renameFile ? renameFile(file) : file);
        const source = join(sourceDir, file);

        await filesystem.mkdir(dirname(link));
        await filesystem.symlinkOrCopy({ source: source, target: link });
    }

    return files;
}
