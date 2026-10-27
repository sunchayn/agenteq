import { dirname, join, relative } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import git from "@infrastructure/git.js";
import type Agent from "@agents/entities/agent.js";
import resolveBoostAgentsAction from "@agents/actions/resolve-boost-agents-action.js";
import resolveBoostSkillsEnabledAction from "@agents/actions/resolve-boost-skills-enabled-action.js";
import type { RunContext } from "@shared/types/run-context.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import { SyncStatus } from "@artifacts/enums/sync-status.js";
import type { SyncResult } from "@artifacts/types/sync-result.js";
import { SyncPayload } from "@artifacts/data-transfer-objects/sync-payload.js";
import type { ResolvedRemoteSource } from "@artifacts/data-transfer-objects/sync-payload.js";
import {
    NAMESPACE_SEPARATOR,
    NAMESPACE_WILDCARD_NAME,
    ROOT_NAMESPACE_ALIASES,
} from "@artifacts/actions/discover-remote-capabilities-action.js";
import { AGENTEQ_SOURCES_ROOT } from "@support/utils/agenteq-sources-root.js";
import saveCopiedFilesFileAction from "@artifacts/actions/save-copied-files-file-action.js";

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

    const { artifactPaths, copiedFilePaths, mirroredFilePaths, results } =
        await syncAgents(capability, payload);

    // Scoped to this one capability, so a sync run that never requested it, e.g. --only mcp,
    // never reconciles or removes a copy recorded under a different capability.
    if (!payload.context.isDryRun) {
        await saveCopiedFilesFileAction({
            capability: capability,
            context: payload.context,
            copiedFilePaths: copiedFilePaths,
            mirroredFilePaths: mirroredFilePaths,
        });
    }

    const warnings = await rootNamespaceAliasConflictWarnings(
        capability,
        payload,
    );

    const warnedPayload = warnings.reduce(
        (current, warning) => current.withRemoteSourceWarning(warning),
        payload,
    );

    return warnedPayload.withResults(results, artifactPaths);
}

/*
 * Interface & Types.
 */

export interface MirrorDirOptions {
    sourceDir: string;
    targetDir: string;
    renameFile?: (file: string) => string;
    filterFiles?: (file: string) => boolean;
    isCopyMode?: boolean;
    isDryRun?: boolean;
}

interface MirrorDirResult {
    files: string[];
    copiedTargetPaths: string[];
    mirroredTargetPaths: string[];
}

interface SyncAgentsResult {
    results: SyncResult[];
    artifactPaths: string[];
    copiedFilePaths: string[];
    mirroredFilePaths: string[];
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
    isCopyMode: boolean;
    sourceDirs: SourceDir[];
    targetRelDir: string;
    isDryRun?: boolean;
    preClaimedNames?: ReadonlySet<string>;
}

interface SyncOneAgentResult {
    result: SyncResult;
    fileCount: number;
    copiedFilePaths: string[];
    mirroredFilePaths: string[];
}

/*
 * Internal.
 */

/**
 * Warns about every item name that shows up in more than one of a remote's root namespace alias folders.
 * The first alias in `ROOT_NAMESPACE_ALIASES` to claim a name wins, same order the actual mirror follows.
 */
async function rootNamespaceAliasConflictWarnings(
    capability: AgentCapability.Commands | AgentCapability.Skills,
    payload: SyncPayload,
): Promise<string[]> {
    const warnings: string[] = [];

    for (const remote of payload.remoteSources) {
        const aliasNames = await Promise.all(
            ROOT_NAMESPACE_ALIASES.map(async (alias) => ({
                alias: alias,
                names: await namesUnder(remote.rootDir, capability, alias),
            })),
        );

        const aliasesByName = new Map<string, string[]>();

        for (const { alias, names } of aliasNames) {
            for (const name of names) {
                aliasesByName.set(name, [
                    ...(aliasesByName.get(name) ?? []),
                    alias,
                ]);
            }
        }

        for (const [name, aliases] of aliasesByName) {
            if (aliases.length < 2) {
                continue;
            }

            const [usedAlias, ...ignoredAliases] = aliases;

            warnings.push(
                `Remote source "${remote.name}" has a ${capability} named "${name}" in both ${aliases.join(" and ")}, using ${usedAlias}/${capability}/${name} and ignoring ${ignoredAliases.map((alias) => `${alias}/${capability}/${name}`).join(", ")}.`,
            );
        }
    }

    return warnings;
}

/**
 * Lists the top-level item names one root namespace alias folder carries for a capability.
 */
async function namesUnder(
    rootDir: string,
    capability: AgentCapability.Commands | AgentCapability.Skills,
    alias: string,
): Promise<Set<string>> {
    const prefix = `${alias}/${capability}/`;
    const isSkills = capability === AgentCapability.Skills;

    const matches = await filesystem.glob({
        cwd: rootDir,
        dot: true,
        onlyDirectories: isSkills || undefined,
        onlyFiles: isSkills ? undefined : true,
        pattern: `${prefix}${isSkills ? "*" : "**/*"}`,
    });

    return new Set(
        matches.map((match) => topLevelName(match.slice(prefix.length))),
    );
}

/**
 * Lists the top-level item names a directory carries for a capability,
 * skills by directory, commands by file and a missing directory reports no names.
 */
async function topLevelNamesIn(
    dir: string | undefined,
    capability: AgentCapability.Commands | AgentCapability.Skills,
): Promise<Set<string>> {
    if (!dir || !(await filesystem.exists(dir))) {
        return new Set();
    }

    const isSkills = capability === AgentCapability.Skills;

    const matches = await filesystem.glob({
        cwd: dir,
        dot: true,
        onlyDirectories: isSkills || undefined,
        onlyFiles: isSkills ? undefined : true,
        pattern: isSkills ? "*" : "**/*",
    });

    return new Set(matches.map(topLevelName));
}

/**
 * Resolves the agent names Laravel Boost targets, when Boost manages local skills.
 * Boost owns .ai/skills for those agents, so their local source dir is skipped,
 * remote skills still sync for them.
 */
async function boostManagedSkillAgentNames(
    capability: AgentCapability.Commands | AgentCapability.Skills,
    context: RunContext,
): Promise<Set<string>> {
    if (capability !== AgentCapability.Skills) {
        return new Set();
    }

    const fileContent = await filesystem.readFile(
        join(context.cwd, "boost.json"),
    );

    if (!fileContent) {
        return new Set();
    }

    const [boostManagesSkills, boostAgents] = await Promise.all([
        resolveBoostSkillsEnabledAction({
            context: context,
            fileContent: fileContent,
        }),
        resolveBoostAgentsAction({
            context: context,
            fileContent: fileContent,
        }),
    ]);

    if (!boostManagesSkills || !boostAgents) {
        return new Set();
    }

    return new Set(boostAgents.map((agent) => agent.name));
}

async function syncAgents(
    capability: AgentCapability.Commands | AgentCapability.Skills,
    payload: SyncPayload,
): Promise<SyncAgentsResult> {
    const sourceDirs = sourceDirsFor(capability, payload);
    const remoteOnlySourceDirs = remoteSourceDirsFor(capability, payload);
    const { isDryRun } = payload.context;
    const { isCopyMode } = payload;

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
        return {
            artifactPaths: [],
            copiedFilePaths: [],
            mirroredFilePaths: [],
            results: [],
        };
    }

    const boostManagedAgentNames = await boostManagedSkillAgentNames(
        capability,
        payload.context,
    );

    // Boost already owns local .ai/skills for its own targeted agents,
    // so its top-level names still block a same-named remote skill from landing there.
    const localSkillNames =
        boostManagedAgentNames.size > 0
            ? await topLevelNamesIn(sourceDirs[0]?.dir, capability)
            : new Set<string>();

    const results: SyncResult[] = [];
    const artifactPaths: string[] = [];
    const copiedFilePaths: string[] = [];
    const mirroredFilePaths: string[] = [];

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

        const isBoostManagedForAgent = boostManagedAgentNames.has(agent.name);

        const {
            copiedFilePaths: agentCopiedFilePaths,
            fileCount,
            mirroredFilePaths: agentMirroredFilePaths,
            result,
        } = await syncOneAgent({
            agent: agent,
            capability: capability,
            cwd: payload.context.cwd,
            isCopyMode: isCopyMode,
            isDryRun: isDryRun,
            preClaimedNames: isBoostManagedForAgent
                ? localSkillNames
                : undefined,
            sourceDirs: isBoostManagedForAgent
                ? remoteOnlySourceDirs
                : sourceDirs,
            targetRelDir: targetRelDir,
        });

        results.push(result);
        copiedFilePaths.push(...agentCopiedFilePaths);
        mirroredFilePaths.push(...agentMirroredFilePaths);

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

    return {
        artifactPaths: artifactPaths,
        copiedFilePaths: copiedFilePaths,
        mirroredFilePaths: mirroredFilePaths,
        results: results,
    };
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
        isCopyMode,
        isDryRun,
        preClaimedNames,
        sourceDirs,
        targetRelDir,
    } = options;

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
        const claimedNames = new Set<string>(preClaimedNames);

        let fileCount = 0;
        const copiedFilePaths: string[] = [];
        const mirroredFilePaths: string[] = [];

        for (const sourceDir of sourceDirs) {
            const { copiedTargetPaths, files, mirroredTargetPaths } =
                await mirrorDir({
                    filterFiles: buildFilesFilterFor(
                        capability,
                        sourceDir.selection,
                        claimedNames,
                    ),
                    isCopyMode: isCopyMode,
                    isDryRun: isDryRun,
                    renameFile: renameFile,
                    sourceDir: sourceDir.dir,
                    targetDir: targetDir,
                });

            for (const file of files) {
                claimedNames.add(topLevelName(file));
            }

            fileCount += files.length;

            for (const copiedTargetPath of copiedTargetPaths) {
                copiedFilePaths.push(relative(cwd, copiedTargetPath));
            }

            for (const mirroredTargetPath of mirroredTargetPaths) {
                mirroredFilePaths.push(relative(cwd, mirroredTargetPath));
            }
        }

        return {
            copiedFilePaths: copiedFilePaths,
            fileCount: fileCount,
            mirroredFilePaths: mirroredFilePaths,
            result: {
                agent: agent.displayName,
                capability: capability,
                item: `${fileCount} file(s)`,
                status: SyncStatus.Written,
            },
        };
    } catch (error) {
        return {
            copiedFilePaths: [],
            fileCount: 0,
            mirroredFilePaths: [],
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

        // No selection to filter against, or this namespace was wildcarded, every file qualifies.
        if (!selectedNames || selectedNames.has(NAMESPACE_WILDCARD_NAME)) {
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
                ? // The root namespace mirrors from the remote's own root and from
                  // any of its root namespace alias folders, e.g. shared or common.
                  [
                      {
                          dir: join(remote.rootDir, capability),
                          selection: groupedSelection,
                      },
                      ...ROOT_NAMESPACE_ALIASES.map((alias) => ({
                          dir: join(remote.rootDir, alias, capability),
                          selection: groupedSelection,
                      })),
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
export function groupByNamespace(selection: string[]): Map<string, string[]> {
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
 * Mirrors every source file into the target directory, optionally filtered.
 * Writes a symlink per file by default, or a real file copy when copy mode is requested.
 * Returns the files mirrored and, in copy mode, the absolute target path of each copy written.
 */
export async function mirrorDir(
    options: MirrorDirOptions,
): Promise<MirrorDirResult> {
    const {
        filterFiles,
        isCopyMode,
        isDryRun,
        renameFile,
        sourceDir,
        targetDir,
    } = options;

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
    const copiedTargetPaths: string[] = [];
    const mirroredTargetPaths: string[] = [];

    if (!isDryRun) {
        for (const file of files) {
            const link = join(targetDir, renameFile ? renameFile(file) : file);

            const source = join(sourceDir, file);

            await filesystem.mkdir(dirname(link));

            // Clears whatever already sits at this exact spot, a symlink or a copy from an earlier sync.
            // This needs to stay here to cover switching modes between copy<>symlink.
            await filesystem.remove(link);

            if (isCopyMode) {
                await filesystem.copyFile({ source: source, target: link });
                copiedTargetPaths.push(link);
            } else {
                await filesystem.symlinkOrCopy({
                    source: source,
                    target: link,
                });
            }

            mirroredTargetPaths.push(link);
        }
    }

    return {
        copiedTargetPaths: copiedTargetPaths,
        files: files,
        mirroredTargetPaths: mirroredTargetPaths,
    };
}
