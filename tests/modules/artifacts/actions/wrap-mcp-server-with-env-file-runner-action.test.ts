import { describe, expect, it } from "vitest";
import {
    McpRemoteServer,
    McpStdioServer,
} from "@agents/entities/mcp-server.js";
import wrapMcpServerWithEnvFileRunnerAction from "@artifacts/actions/wrap-mcp-server-with-env-file-runner-action.js";

describe("wrapMcpServerWithEnvFileRunnerAction", () => {
    it("returns a stdio server unchanged when it has no envFile", () => {
        const server = new McpStdioServer({ command: "npx", key: "example" });

        expect(
            wrapMcpServerWithEnvFileRunnerAction({
                server: server,
                version: "1.0.0",
            }),
        ).toBe(server);
    });

    it("wraps a stdio server's command behind agenteq's own runner", () => {
        const server = new McpStdioServer({
            args: ["-y", "example"],
            command: "npx",
            cwd: "./servers/example",
            env: { TOKEN: "${TOKEN}" },
            envFile: [".env"],
            key: "example",
        });

        const wrapped = wrapMcpServerWithEnvFileRunnerAction({
            server: server,
            version: "1.0.0",
        });

        expect(wrapped).toBeInstanceOf(McpStdioServer);
        expect(wrapped.key).toBe("example");

        const stdio = wrapped as McpStdioServer;

        expect(stdio.command).toBe("npx");
        expect(stdio.args).toEqual([
            "-y",
            "agenteq@1.0.0",
            "mcp",
            "exec",
            "--dotenv",
            ".env",
            "--",
            "npx",
            "-y",
            "example",
        ]);

        expect(stdio.cwd).toBe("./servers/example");
        expect(stdio.env).toEqual({ TOKEN: "${TOKEN}" });
    });

    it("adds a --dotenv flag per path, in order, for multiple env files", () => {
        const server = new McpStdioServer({
            command: "npx",
            envFile: [".env", ".env.local"],
            key: "example",
        });

        const wrapped = wrapMcpServerWithEnvFileRunnerAction({
            server: server,
            version: "1.0.0",
        }) as McpStdioServer;

        expect(wrapped.args).toEqual([
            "-y",
            "agenteq@1.0.0",
            "mcp",
            "exec",
            "--dotenv",
            ".env",
            "--dotenv",
            ".env.local",
            "--",
            "npx",
        ]);
    });

    it("bridges a remote server into mcp-remote, with its headers unexpanded", () => {
        const server = new McpRemoteServer({
            envFile: [".env"],
            headers: { Authorization: "Bearer ${TOKEN}" },
            key: "example",
            type: "http",
            url: "https://example.com/mcp",
        });

        const wrapped = wrapMcpServerWithEnvFileRunnerAction({
            server: server,
            version: "1.0.0",
        });

        expect(wrapped).toBeInstanceOf(McpStdioServer);

        const stdio = wrapped as McpStdioServer;

        expect(stdio.command).toBe("npx");
        expect(stdio.args).toEqual([
            "-y",
            "agenteq@1.0.0",
            "mcp",
            "exec",
            "--dotenv",
            ".env",
            "--",
            "npx",
            "-y",
            "mcp-remote",
            "https://example.com/mcp",
            "--header",
            "Authorization: Bearer ${TOKEN}",
        ]);
    });

    it("returns a remote server unchanged when it has no envFile", () => {
        const server = new McpRemoteServer({
            key: "example",
            type: "sse",
            url: "https://example.com/sse",
        });

        expect(
            wrapMcpServerWithEnvFileRunnerAction({
                server: server,
                version: "1.0.0",
            }),
        ).toBe(server);
    });
});
