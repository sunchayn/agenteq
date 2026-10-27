import {
    McpRemoteServer,
    McpStdioServer,
} from "@agents/entities/mcp-server.js";
import type { McpServer } from "@agents/entities/mcp-server.js";

/**
 * Wraps a server with an envFile into agenteq's own runner.
 * It resolves the server's ${VAR} placeholders at runtime, never at sync.
 * A server with no envFile is returned unchanged.
 */
export default function wrapMcpServerWithEnvFileRunnerAction(
    options: WrapMcpServerOptions,
): McpServer {
    const { server, version } = options;

    if (!server.envFile || server.envFile.length === 0) {
        return server;
    }

    // --dotenv, not --env-file, since Node 20.6+ intercepts --env-file itself.
    const runnerPrefix = [
        "-y",
        `agenteq@${version}`,
        "mcp",
        "exec",
        ...server.envFile.flatMap((path) => ["--dotenv", path]),
        "--",
    ];

    if (server instanceof McpStdioServer) {
        return new McpStdioServer({
            args: [...runnerPrefix, server.command, ...(server.args ?? [])],
            command: "npx",
            cwd: server.cwd,
            env: server.env,
            extra: server.extra,
            key: server.key,
        });
    }

    if (!(server instanceof McpRemoteServer)) {
        return server;
    }

    // A remote server has no process to wrap, so it bridges through mcp-remote instead.
    return new McpStdioServer({
        args: [
            ...runnerPrefix,
            "npx",
            "-y",
            "mcp-remote",
            server.url,
            ...headerArgsFor(server),
        ],
        command: "npx",
        extra: server.extra,
        key: server.key,
    });
}

/*
 * Interface & Types.
 */

interface WrapMcpServerOptions {
    server: McpServer;
    version: string;
}

/*
 * Internal.
 */

function headerArgsFor(server: McpRemoteServer): string[] {
    return Object.entries(server.headers ?? {}).flatMap(([name, value]) => [
        "--header",
        `${name}: ${value}`,
    ]);
}
