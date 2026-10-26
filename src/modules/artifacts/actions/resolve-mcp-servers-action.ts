import { basename, dirname, join } from "node:path";
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
 * Resolves every given mcp config path into a validated McpServer.
 */
export default async function resolveMcpServersAction(
    options: ResolveMcpServersOptions,
): Promise<McpServer[]> {
    const { cwd, files } = options;

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

interface ResolveMcpServersOptions {
    cwd: string;
    files: string[];
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

    // The server's key is its own directory name, independent of this file's content.
    const key = basename(dirname(relativePath));

    return toMcpServer(parsed, key);
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
 * Reshapes one validated config entry, plus its key read from the config's own directory name,
 * into the canonical McpServer, branching only on server kind.
 */
function toMcpServer(
    parsed: z.infer<typeof mcpSchema>,
    key: string,
): McpServer {
    if (parsed.type === "stdio") {
        return new McpStdioServer({
            args: parsed.config.args,
            command: parsed.config.command,
            cwd: parsed.config.cwd,
            env: parsed.config.env,
            envFile: normalizeEnvFile(parsed.config.envFile),
            extra: extractExtra(parsed.config, STDIO_FIELDS),
            key: key,
        });
    }

    return new McpRemoteServer({
        envFile: normalizeEnvFile(parsed.config.envFile),
        extra: extractExtra(parsed.config, REMOTE_FIELDS),
        headers: parsed.config.headers,
        key: key,
        type: parsed.type,
        url: parsed.config.url,
    });
}

/**
 * Normalizes a canonical config's envFile, a single path or a list, into a list.
 */
function normalizeEnvFile(
    envFile: string | string[] | undefined,
): string[] | undefined {
    if (!envFile) {
        return undefined;
    }

    return Array.isArray(envFile) ? envFile : [envFile];
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
