import type { McpServerMappers } from "@agents/types/mcp-server-mapper.js";

/**
 * One canonical MCP server, reshaped from a .ai/mcp/<name>/config.json file.
 */
export abstract class McpServer {
    readonly key: string;

    readonly extra?: Record<string, unknown>;

    abstract readonly type: "stdio" | "http" | "sse";

    protected constructor(options: McpServerOptions) {
        this.key = options.key;
        this.extra = options.extra;
    }

    abstract toAgentEntry(mappers: McpServerMappers): Record<string, unknown>;
}

export class McpStdioServer extends McpServer {
    readonly type = "stdio" as const;

    readonly command: string;

    readonly args?: string[];

    readonly env?: Record<string, string>;

    readonly cwd?: string;

    constructor(options: McpStdioServerOptions) {
        super(options);

        this.command = options.command;
        this.args = options.args;
        this.env = options.env;
        this.cwd = options.cwd;
    }

    toAgentEntry(mappers: McpServerMappers): Record<string, unknown> {
        return mappers.stdio(this);
    }
}

export class McpRemoteServer extends McpServer {
    readonly type: "http" | "sse";

    readonly url: string;

    readonly headers?: Record<string, string>;

    constructor(options: McpRemoteServerOptions) {
        super(options);
        this.type = options.type;
        this.url = options.url;
        this.headers = options.headers;
    }

    toAgentEntry(mappers: McpServerMappers): Record<string, unknown> {
        return mappers.remote(this);
    }
}

/*
 * Interface & Types.
 */

export interface McpServerOptions {
    readonly key: string;
    /**
     * Any other field present in the canonical config that agenteq does not recognize.
     */
    readonly extra?: Record<string, unknown>;
}

export interface McpStdioServerOptions extends McpServerOptions {
    readonly command: string;
    readonly args?: string[];
    readonly env?: Record<string, string>;
    readonly cwd?: string;
}

export interface McpRemoteServerOptions extends McpServerOptions {
    readonly type: "http" | "sse";
    readonly url: string;
    readonly headers?: Record<string, string>;
}
