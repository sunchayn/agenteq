import { describe, expect, it } from "vitest";
import { tomlFormatter } from "@artifacts/services/artifacts-manager/stages/mcp/formatters.js";
import { McpStdioServer } from "@agents/entities/mcp-server.js";
import type { McpServer } from "@agents/entities/mcp-server.js";

const server = new McpStdioServer({
    args: ["-y", "example"],
    command: "npx",
    key: "example",
});

function mapServer(s: McpServer): Record<string, unknown> {
    if (!(s instanceof McpStdioServer)) {
        return {};
    }

    return { args: s.args ?? [], command: s.command };
}

describe("tomlFormatter", () => {
    it("writes a new server entry as TOML", () => {
        const result = tomlFormatter.apply({
            config: server,
            keyPath: ["mcp_servers"],
            mapper: mapServer,
            text: "",
        });

        expect(result.status).toBe("written");
        expect(result.text).toContain("[mcp_servers.example]");
        expect(result.text).toContain('command = "npx"');
    });

    it("preserves other top-level tables already present in the file", () => {
        const result = tomlFormatter.apply({
            config: server,
            keyPath: ["mcp_servers"],
            mapper: mapServer,
            text: 'model = "gpt-5"\n\n[other_table]\nfoo = "bar"\n',
        });

        expect(result.text).toContain('model = "gpt-5"');
        expect(result.text).toContain("[other_table]");
        expect(result.text).toContain("[mcp_servers.example]");
    });

    it("skips an entry that already exists", () => {
        const first = tomlFormatter.apply({
            config: server,
            keyPath: ["mcp_servers"],
            mapper: mapServer,
            text: "",
        });

        const second = tomlFormatter.apply({
            config: server,
            keyPath: ["mcp_servers"],
            mapper: mapServer,
            text: first.text,
        });

        expect(second.status).toBe("skipped");
    });

    it("skips when an intermediate key holds a scalar value", () => {
        const conflictingText = 'mcp_servers = "not a table"\n';

        const result = tomlFormatter.apply({
            config: server,
            keyPath: ["mcp_servers"],
            mapper: mapServer,
            text: conflictingText,
        });

        expect(result.status).toBe("skipped");
        expect(result.text).toBe(conflictingText);
    });
});
