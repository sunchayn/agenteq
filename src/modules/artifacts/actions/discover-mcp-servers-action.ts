import { join } from "node:path";
import {
    mcpSchema,
    remoteConfig,
    stdioConfig,
} from "@artifacts/schemas/mcp-schema.js";
import { CliError } from "@support/errors/cli-error.js";
import filesystem from "@infrastructure/filesystem.js";
import {
    McpRemoteServer,
    McpStdioServer,
} from "@agents/entities/mcp-server.js";
import type { McpServer } from "@agents/entities/mcp-server.js";
import type { z } from "zod";

/**
 * Globs every .ai/mcp/<name>/config.json under sourceDir, validates each, and reshapes matches into McpServer.
 */
export default async function discoverMcpServersAction(
    options: DiscoverMcpServersOptions,
): Promise<McpServer[]> {
    const { cwd, sourceDir = ".ai" } = options;

    const files = await filesystem.glob({
        cwd: cwd,
        pattern: `${sourceDir}/mcp/*/config.json`,
    });

    const servers: McpServer[] = [];

    for (const relativePath of files) {
        servers.push(
            await loadMcpServer({ cwd: cwd, relativePath: relativePath }),
        );
    }

    return servers;
}

/*
 * Interface & Types.
 */

interface DiscoverMcpServersOptions {
    cwd: string;
    sourceDir?: string;
}

interface LoadMcpServerOptions {
    cwd: string;
    relativePath: string;
}

/*
 * Internal.
 */

const STDIO_FIELDS = Object.keys(stdioConfig.shape);
const REMOTE_FIELDS = Object.keys(remoteConfig.shape);

/**
 * Reads, validates, and reshapes one .ai/mcp/<name>/config.json file into a standardized McpServer.
 */
async function loadMcpServer(
    options: LoadMcpServerOptions,
): Promise<McpServer> {
    const { cwd, relativePath } = options;

    const absolutePath = join(cwd, relativePath);
    const text = (await filesystem.readFile(absolutePath)) ?? "";
    const raw = parseConfigFile(relativePath, text);
    const parsed = validateMcpConfig(relativePath, raw);

    return toMcpServer(parsed);
}

function parseConfigFile(relativePath: string, text: string): unknown {
    try {
        return JSON.parse(text);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);

        throw new CliError(
            "E_INVALID_MCP_CONFIG",
            `Invalid MCP config at ${relativePath}: not valid JSON (${reason}).`,
        );
    }
}

function validateMcpConfig(
    relativePath: string,
    raw: unknown,
): z.infer<typeof mcpSchema> {
    const result = mcpSchema.safeParse(raw);

    if (!result.success) {
        const issues = result.error.issues
            .map(
                (issue) =>
                    `${issue.path.join(".") || "(root)"}: ${issue.message}`,
            )
            .join("; ");

        throw new CliError(
            "E_INVALID_MCP_CONFIG",
            `Invalid MCP config at ${relativePath}: ${issues}. Fix the file and rerun.`,
        );
    }

    return result.data;
}

/**
 * Reshapes one validated config entry into the canonical McpServer, branching only on server kind.
 */
function toMcpServer(parsed: z.infer<typeof mcpSchema>): McpServer {
    if (parsed.type === "stdio") {
        return new McpStdioServer({
            args: parsed.config.args,
            command: parsed.config.command,
            cwd: parsed.config.cwd,
            env: parsed.config.env,
            extra: extractExtra(parsed.config, STDIO_FIELDS),
            key: parsed.key,
        });
    }

    return new McpRemoteServer({
        extra: extractExtra(parsed.config, REMOTE_FIELDS),
        headers: parsed.config.headers,
        key: parsed.key,
        type: parsed.type,
        url: parsed.config.url,
    });
}

function extractExtra(
    config: Record<string, unknown>,
    knownFields: string[],
): Record<string, unknown> | undefined {
    const extra = Object.fromEntries(
        Object.entries(config).filter(
            ([field]) => !knownFields.includes(field),
        ),
    );

    return Object.keys(extra).length > 0 ? extra : undefined;
}
