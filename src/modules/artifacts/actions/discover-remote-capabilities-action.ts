import { dirname } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import discoverMcpServersAction from "@artifacts/actions/discover-mcp-servers-action.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";

/*
 * Interface & Types.
 */

/**
 * A capability this action knows how to find under a classified sub-folder.
 * Guidelines is deliberately excluded, it stays a single root-level file, never folder-classified.
 */
type FolderCapability =
    AgentCapability.Skills | AgentCapability.Commands | AgentCapability.Mcp;

interface DiscoverRemoteCapabilitiesOptions {
    rootDir: string;
}

export interface RemoteCapabilities {
    skills: string[];
    commands: string[];
    mcp: string[];
    hasGuidelines: boolean;
}

/**
 * Separator joining a nested item's namespace and name into one selection identifier.
 * A root-level item, whose namespace is empty, has nothing to join, so it keeps its bare name instead.
 */
export const NAMESPACE_SEPARATOR = "::";

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

    const [skillPaths, commandPaths, mcpConfigPaths, hasGuidelines] =
        await Promise.all([
            filesystem.glob({
                cwd: rootDir,
                onlyDirectories: true,
                pattern: `**/${AgentCapability.Skills}/*`,
            }),
            filesystem.glob({
                cwd: rootDir,
                onlyFiles: true,
                pattern: `**/${AgentCapability.Commands}/**/*`,
            }),
            filesystem.glob({
                cwd: rootDir,
                pattern: `**/${AgentCapability.Mcp}/*/config.json`,
            }),
            filesystem.exists(`${rootDir}/GUIDELINES.md`),
        ]);

    // Validates every discovered mcp config, throwing a clear error on a malformed one.
    await discoverMcpServersAction({
        cwd: rootDir,
        recursive: true,
        sourceDir: ".",
    });

    return {
        commands: commandPaths.map((path) =>
            namespacedIdentifier(path, AgentCapability.Commands),
        ),
        hasGuidelines: hasGuidelines,
        mcp: mcpConfigPaths.map((path) =>
            namespacedIdentifier(path, AgentCapability.Mcp),
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

    return namespace ? `${namespace}${NAMESPACE_SEPARATOR}${name}` : name;
}
