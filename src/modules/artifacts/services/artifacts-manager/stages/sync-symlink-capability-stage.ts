import { dirname, join } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import git from "@infrastructure/git.js";
import type Agent from "@agents/entities/agent.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import { SyncStatus } from "@artifacts/enums/sync-status.js";
import type { SyncResult } from "@artifacts/types/sync-result.js";
import { SyncPayload } from "@artifacts/data-transfer-objects/sync-payload.js";
import type { ResolvedRemoteSource } from "@artifacts/data-transfer-objects/sync-payload.js";
import {
    NAMESPACE_SEPARATOR,
    SHARED_NAMESPACE,
} from "@artifacts/actions/discover-remote-capabilities-action.js";
import { AGENTEQ_SOURCES_ROOT } from "@support/utils/agenteq-sources-root.js";

/**
 * Reusable sync stage to mirror one symlink-configured capability (commands or skills) into every selected agent.
 * Mirrors the local canonical source, then every configured remote source, as one ordered list of directories.
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
    isDryRun?: boolean;
}

interface SyncAgentsResult {
    results: SyncResult[];
    artifactPaths: string[];
}

/**
 * One directory to mirror files from, the local canonical source or one namespace of one remote source.
 * `selection` lists the names allowed from this directory. Every file mirrors when it is omitted,
 * the case for the local source, which has no selection to filter against.
 */
interface SourceDir {
    dir: string;
    selection?: string[];
}

interface SyncOneAgentOptions {
    agent: Agent;
    capability: AgentCapability.Commands | AgentCapability.Skills;
    cwd: string;
    sourceDirs: SourceDir[];
    targetRelDir: string;
    isDryRun?: boolean;
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
    const sourceDirs = sourceDirsFor(capability, payload);
    const { isDryRun } = payload.context;

    // Runs before the early return below, since a removed remote source leaves nothing else to sync.
    // Skipped during a dry run, which never removes a symlink from disk.
    if (!isDryRun) {
        await pruneOrphanedRemoteSymlinks(capability, payload);
    }

    const hasAnySource = (
        await Promise.all(
            sourceDirs.map((sourceDir) => filesystem.exists(sourceDir.dir)),
        )
    ).some(Boolean);

    if (!hasAnySource) {
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
            isDryRun: isDryRun,
            sourceDirs: sourceDirs,
            targetRelDir: targetRelDir,
        });

        results.push(result);

        if (result.status === SyncStatus.Written && fileCount > 0) {
            // A dry run only reports the status, it never touches .gitignore.
            if (!isDryRun) {
                await git.ignore({
                    cwd: payload.context.cwd,
                    relPath: targetRelDir,
                });
            }

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
    const { agent, capability, cwd, isDryRun, sourceDirs, targetRelDir } =
        options;

    const targetDir = join(cwd, targetRelDir);

    // Only commands ever need renaming, e.g. Copilot's ".prompt.md" requirement.
    const commandsFileExtension = agent.commandsFileExtension;

    const renameFile =
        capability === AgentCapability.Commands && commandsFileExtension
            ? (file: string) => file.replace(/\.md$/, commandsFileExtension)
            : undefined;

    try {
        // Earlier directories win a same-name collision over every later one, the local source,
        // always listed first, wins over every remote, then each remote wins over every later one.
        const claimedNames = new Set<string>();

        let fileCount = 0;

        for (const sourceDir of sourceDirs) {
            const files = await mirrorDir({
                filterFiles: buildFilesFilterFor(
                    capability,
                    sourceDir.selection,
                    claimedNames,
                ),
                isDryRun: isDryRun,
                renameFile: renameFile,
                sourceDir: sourceDir.dir,
                targetDir: targetDir,
            });

            for (const file of files) {
                claimedNames.add(topLevelName(file));
            }

            fileCount += files.length;
        }

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
 * Builds the predicate deciding whether one mirrored file from a source directory is allowed.
 */
function buildFilesFilterFor(
    capability: AgentCapability.Commands | AgentCapability.Skills,
    selection: string[] | undefined,
    excludedNames: ReadonlySet<string>,
): (file: string) => boolean {
    const selectedNames = selection ? new Set(selection) : undefined;

    return function (file) {
        const name = topLevelName(file);

        // An earlier source directory already placed a file under this top-level name.
        if (excludedNames.has(name)) {
            return false;
        }

        // No selection to filter against, every file from this source directory qualifies.
        if (!selectedNames) {
            return true;
        }

        // Skills select by top-level directory name, since a whole skill directory is one unit,
        // commands select by exact file path, since each command is one standalone file.
        return capability === AgentCapability.Skills
            ? selectedNames.has(name)
            : selectedNames.has(file);
    };
}

function topLevelName(file: string): string {
    return file.split("/")[0];
}

/**
 * Every directory to mirror from. The local canonical source comes first,
 * then every configured remote source's namespace directories, in order.
 */
function sourceDirsFor(
    capability: AgentCapability.Commands | AgentCapability.Skills,
    payload: SyncPayload,
): SourceDir[] {
    const localDir = join(
        payload.context.cwd,
        payload.context.sourceDir,
        capability,
    );

    return [{ dir: localDir }, ...remoteSourceDirsFor(capability, payload)];
}

/**
 * Every namespace directory to mirror from, across every configured remote source.
 * Preserves the order the remotes were configured in.
 */
function remoteSourceDirsFor(
    capability: AgentCapability.Commands | AgentCapability.Skills,
    payload: SyncPayload,
): SourceDir[] {
    return payload.remoteSources.flatMap((remote) =>
        namespaceDirsFor(capability, remote),
    );
}

/**
 * One remote's namespace directories, its root namespace first, then the rest alphabetically.
 * A remote whose selection mixes a root skill and a backend-namespaced one, for example,
 * returns two entries here, one for the root `skills` folder and one for `backend/skills`.
 */
function namespaceDirsFor(
    capability: AgentCapability.Commands | AgentCapability.Skills,
    remote: ResolvedRemoteSource,
): SourceDir[] {
    const selection =
        capability === AgentCapability.Skills
            ? remote.selection.skills
            : remote.selection.commands;

    const selectionByNamespace = groupByNamespace(selection);

    return [...selectionByNamespace.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .flatMap(([namespace, groupedSelection]) =>
            namespace === ""
                ? // The root namespace mirrors from both the remote's own root and its shared-namespace folder.
                  [
                      {
                          dir: join(remote.rootDir, capability),
                          selection: groupedSelection,
                      },
                      {
                          dir: join(
                              remote.rootDir,
                              SHARED_NAMESPACE,
                              capability,
                          ),
                          selection: groupedSelection,
                      },
                  ]
                : [
                      {
                          dir: join(remote.rootDir, namespace, capability),
                          selection: groupedSelection,
                      },
                  ],
        );
}

/**
 * Groups a remote's saved selection by namespace, stripping the namespace prefix off each entry.
 * An entry with no namespace prefix, a root-level item, groups under the empty namespace.
 */
function groupByNamespace(selection: string[]): Map<string, string[]> {
    const selectionByNamespace = new Map<string, string[]>();

    for (const entry of selection) {
        const separatorIndex = entry.indexOf(NAMESPACE_SEPARATOR);

        const namespace =
            separatorIndex === -1 ? "" : entry.slice(0, separatorIndex);

        const name =
            separatorIndex === -1
                ? entry
                : entry.slice(separatorIndex + NAMESPACE_SEPARATOR.length);

        selectionByNamespace.set(namespace, [
            ...(selectionByNamespace.get(namespace) ?? []),
            name,
        ]);
    }

    return selectionByNamespace;
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
 * Returns the list of files actually mirrored. A source directory that does not exist mirrors nothing.
 * A dry run still globs and filters the source to report an accurate file count, but never touches the target.
 */
async function mirrorDir(options: MirrorDirOptions): Promise<string[]> {
    const { filterFiles, isDryRun, renameFile, sourceDir, targetDir } = options;

    if (!isDryRun) {
        // Only symlinks pointing into sourceDir are cleared before repopulating,
        // so a real file the agent or the user placed in targetDir is left untouched.
        await filesystem.removeSymlinksInto({
            sourceDir: sourceDir,
            targetDir: targetDir,
        });
    }

    const allFiles = await filesystem.glob({
        cwd: sourceDir,
        dot: true,
        onlyFiles: true,
        pattern: "**/*",
    });

    const files = filterFiles ? allFiles.filter(filterFiles) : allFiles;

    if (!isDryRun) {
        for (const file of files) {
            const link = join(targetDir, renameFile ? renameFile(file) : file);

            const source = join(sourceDir, file);

            await filesystem.mkdir(dirname(link));
            await filesystem.symlinkOrCopy({ source: source, target: link });
        }
    }

    return files;
}
