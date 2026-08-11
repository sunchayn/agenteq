import { describe, expect, it } from "vitest";
import {
    McpRemoteServer,
    McpStdioServer,
} from "@agents/entities/mcp-server.js";
import {
    stdioMapper,
    typedStdioMapper,
} from "@agents/mcpMappers/stdio-mapper.js";
import {
    remoteMapper,
    untypedRemoteMapper,
} from "@agents/mcpMappers/remote-mapper.js";

describe("stdioMapper", () => {
    it("covers command, args, and env, with no type field", () => {
        const server = new McpStdioServer({
            args: ["-y", "x"],
            command: "npx",
            key: "a",
        });

        expect(stdioMapper(server)).toEqual({
            args: ["-y", "x"],
            command: "npx",
            env: {},
        });
    });

    it("passes unknown extra fields through to the resulting config", () => {
        const server = new McpStdioServer({
            command: "npx",
            extra: { timeout: 30 },
            key: "a",
        });

        expect(stdioMapper(server)).toEqual({
            args: [],
            command: "npx",
            env: {},
            timeout: 30,
        });
    });
});

describe("typedStdioMapper", () => {
    it("produces the same shape as stdioMapper plus a type field", () => {
        const server = new McpStdioServer({
            args: ["-y"],
            command: "npx",
            env: { DEBUG: "true" },
            key: "test",
        });

        expect(typedStdioMapper(server)).toEqual({
            args: ["-y"],
            command: "npx",
            env: { DEBUG: "true" },
            type: "stdio",
        });
    });
});

describe("remoteMapper", () => {
    it("produces type, url, and headers", () => {
        const server = new McpRemoteServer({
            key: "a",
            type: "http",
            url: "https://x.com",
        });

        expect(remoteMapper(server)).toEqual({
            type: "http",
            url: "https://x.com",
        });
    });
});

describe("untypedRemoteMapper", () => {
    it("drops the type field, keeping url, headers, and extra", () => {
        const server = new McpRemoteServer({
            headers: { "X-API-Key": "secret" },
            key: "test",
            type: "http",
            url: "https://example.com",
        });

        expect(untypedRemoteMapper(server)).toEqual({
            headers: { "X-API-Key": "secret" },
            url: "https://example.com",
        });
    });
});
