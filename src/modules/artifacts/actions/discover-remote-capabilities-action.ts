import { dirname } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import resolveMcpServersAction from "@artifacts/actions/resolve-mcp-servers-action.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";

/*
 * Interface & Types.
 */

/**
 * A capability this action knows how to find under a classified sub-folder.
 * Guidelines is deliberately excluded, it stays a single root-level file, never folder-classified.
 */
type FolderCapability =
    | AgentCapability.Skills
    | AgentCapability.Commands
    | AgentCapability.Mcp
    | AgentCapability.References;

interface DiscoverRemoteCapabilitiesOptions {
    rootDir: string;
}

export interface RemoteCapabilities {
    skills: string[];
    commands: string[];
    mcp: string[];
    references: string[];
    hasGuidelines: boolean;
}

/**
 * The folder name a remote source might carry to group root level (unamspaced) capabilities.
 */
export const SHARED_NAMESPACE = ".shared";

/**
 * Separator joining a nested item's namespace and name into one selection identifier.
 * A root-level item, whose namespace is empty, has nothing to join, so it keeps its bare name instead.
 */
export const NAMESPACE_SEPARATOR = "::";

/**
 * Lists every root-level directory a namespace can come from.
 */
async function namespaceCandidateDirs(rootDir: string): Promise<string[]> {
    const rootDirs = await filesystem.glob({
        cwd: rootDir,
        dot: true,
        onlyDirectories: true,
        pattern: "*",
    });

    return rootDirs.filter(
        // Dot folder are excluded, only the shared namespace (if present) is included.
        (dir) => dir === SHARED_NAMESPACE || !dir.startsWith("."),
    );
}

/**
 * Builds the glob patterns matching one capability's items at a remote's root,
 * and directly inside each of its namespace candidate directories.
 */
function buildCapabilityPatterns(
    capability: FolderCapability,
    itemPattern: string,
    namespaceDirs: string[],
): string[] {
    return [
        `${capability}/${itemPattern}`,
        ...namespaceDirs.map(
            (dir) =>
                `${filesystem.escapeGlobSegment(dir)}/${capability}/${itemPattern}`,
        ),
    ];
}

/**
 * Globs every mcp config directly inside the given namespace candidate directories.
 */
function mcpConfigFilesIn(
    rootDir: string,
    namespaceDirs: string[],
): Promise<string[]> {
    return filesystem.glob({
        cwd: rootDir,
        dot: true,
        pattern: buildCapabilityPatterns(
            AgentCapability.Mcp,
            "*/config.json",
            namespaceDirs,
        ),
    });
}

/**
 * Globs every mcp config at a remote source's root, respecting its namespace folders.
 * Exposed so a sync stage can resolve the same set of files discovery already lists,
 * without duplicating the namespace rule that excludes a dot folder other than the shared one.
 */
export async function remoteMcpConfigFiles(rootDir: string): Promise<string[]> {
    const namespaceDirs = await namespaceCandidateDirs(rootDir);

    return mcpConfigFilesIn(rootDir, namespaceDirs);
}

/**
 * Strips a selection identifier's namespace prefix, leaving its bare name.
 * A root-level identifier, with no namespace to strip, is returned unchanged.
 */
export function removeNamespace(identifier: string): string {
    const separatorIndex = identifier.indexOf(NAMESPACE_SEPARATOR);

    return separatorIndex === -1
        ? identifier
        : identifier.slice(separatorIndex + NAMESPACE_SEPARATOR.length);
}

/**
 * Scans a remote source's cloned root for every AI capability it offers,
 * at the root and in any classified sub-folder, e.g. `backend/skills/*` alongside a root-level `skills/*`.
 */
export default async function discoverRemoteCapabilitiesAction(
    options: DiscoverRemoteCapabilitiesOptions,
): Promise<RemoteCapabilities> {
    const { rootDir } = options;

    const namespaceDirs = await namespaceCandidateDirs(rootDir);

    const [
        skillPaths,
        commandPaths,
        mcpConfigPaths,
        referencePaths,
        hasGuidelines,
    ] = await Promise.all([
        filesystem.glob({
            cwd: rootDir,
            dot: true,
            onlyDirectories: true,
            pattern: buildCapabilityPatterns(
                AgentCapability.Skills,
                "*",
                namespaceDirs,
            ),
        }),
        filesystem.glob({
            cwd: rootDir,
            dot: true,
            onlyFiles: true,
            pattern: buildCapabilityPatterns(
                AgentCapability.Commands,
                "**/*",
                namespaceDirs,
            ),
        }),
        mcpConfigFilesIn(rootDir, namespaceDirs),
        filesystem.glob({
            cwd: rootDir,
            dot: true,
            onlyFiles: true,
            pattern: buildCapabilityPatterns(
                AgentCapability.References,
                "**/*",
                namespaceDirs,
            ),
        }),
        filesystem.exists(`${rootDir}/GUIDELINES.md`),
    ]);

    // Validates every mcp config already discovered above.
    await resolveMcpServersAction({ cwd: rootDir, files: mcpConfigPaths });

    return {
        commands: commandPaths.map((path) =>
            namespacedIdentifier(path, AgentCapability.Commands),
        ),
        hasGuidelines: hasGuidelines,
        mcp: mcpConfigPaths.map((path) =>
            namespacedIdentifier(path, AgentCapability.Mcp),
        ),
        references: referencePaths.map((path) =>
            namespacedIdentifier(path, AgentCapability.References),
        ),
        skills: skillPaths.map((path) =>
            namespacedIdentifier(path, AgentCapability.Skills),
        ),
    };
}

/*
 * Internal.
 */

/**
 * Splits a discovered path on its capability's folder segment into a namespace and the rest.
 * A root match like "skills/foo" has an empty namespace, a nested one like "backend/skills/foo" has "backend".
 */
function splitCapabilityPath(
    path: string,
    capability: FolderCapability,
): { namespace: string; rest: string } {
    const folderIndex = path.indexOf(`${capability}/`);
    const namespace = path.slice(0, Math.max(0, folderIndex - 1));
    const rest = path.slice(folderIndex + capability.length + 1);

    return { namespace: namespace, rest: rest };
}

/**
 * Joins a discovered path's namespace and name into this module's selection identifier.
 * A root match becomes its bare name, a nested one becomes its namespace and name joined by the separator.
 */
function namespacedIdentifier(
    path: string,
    capability: FolderCapability,
): string {
    const { namespace, rest } = splitCapabilityPath(path, capability);

    // An mcp path's rest is still "<name>/config.json", its real name is that file's own directory.
    const name = capability === AgentCapability.Mcp ? dirname(rest) : rest;

    // The shared namespace folder resolves to the root namespace, same as a bare name.
    const rootNamespace = namespace === SHARED_NAMESPACE ? "" : namespace;

    return rootNamespace
        ? `${rootNamespace}${NAMESPACE_SEPARATOR}${name}`
        : name;
}
