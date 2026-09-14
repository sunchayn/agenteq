import filesystem from "@infrastructure/filesystem.js";
import discoverMcpServersAction from "@artifacts/actions/discover-mcp-servers-action.js";

/**
 * Scans a remote source's cloned root for every AI capability it offers.
 */
export default async function discoverRemoteCapabilitiesAction(
    options: DiscoverRemoteCapabilitiesOptions,
): Promise<RemoteCapabilities> {
    const { rootDir } = options;

    const [skills, commands, mcpServers, hasGuidelines] = await Promise.all([
        filesystem.glob({
            cwd: rootDir,
            onlyDirectories: true,
            pattern: "skills/*",
        }),
        filesystem.glob({
            cwd: rootDir,
            onlyFiles: true,
            pattern: "commands/**/*",
        }),
        discoverMcpServersAction({ cwd: rootDir, sourceDir: "." }),
        filesystem.exists(`${rootDir}/GUIDELINES.md`),
    ]);

    return {
        commands: commands.map((path) => path.replace(/^commands\//, "")),
        hasGuidelines: hasGuidelines,
        mcp: mcpServers.map((server) => server.key),
        skills: skills.map((path) => path.replace(/^skills\//, "")),
    };
}

/*
 * Interface & Types.
 */

interface DiscoverRemoteCapabilitiesOptions {
    rootDir: string;
}

export interface RemoteCapabilities {
    skills: string[];
    commands: string[];
    mcp: string[];
    hasGuidelines: boolean;
}
