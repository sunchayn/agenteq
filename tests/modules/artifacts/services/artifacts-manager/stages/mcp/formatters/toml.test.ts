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
        const result = tomlFormatter.reconcile({
            keyPath: ["mcp_servers"],
            mapper: mapServer,
            servers: [server],
            text: "",
        });

        expect(result.statusesByKey.get("example")).toBe("written");
        expect(result.text).toContain("[mcp_servers.example]");
        expect(result.text).toContain('command = "npx"');
    });

    it("preserves other top-level tables already present in the file", () => {
        const result = tomlFormatter.reconcile({
            keyPath: ["mcp_servers"],
            mapper: mapServer,
            servers: [server],
            text: 'model = "gpt-5"\n\n[other_table]\nfoo = "bar"\n',
        });

        expect(result.text).toContain('model = "gpt-5"');
        expect(result.text).toContain("[other_table]");
        expect(result.text).toContain("[mcp_servers.example]");
    });

    it("skips an entry that already matches", () => {
        const first = tomlFormatter.reconcile({
            keyPath: ["mcp_servers"],
            mapper: mapServer,
            servers: [server],
            text: "",
        });

        const second = tomlFormatter.reconcile({
            keyPath: ["mcp_servers"],
            mapper: mapServer,
            servers: [server],
            text: first.text,
        });

        expect(second.statusesByKey.get("example")).toBe("skipped");
    });

    it("re-writes an entry whose canonical config changed since it was last synced", () => {
        const first = tomlFormatter.reconcile({
            keyPath: ["mcp_servers"],
            mapper: mapServer,
            servers: [server],
            text: "",
        });

        const changedServer = new McpStdioServer({
            args: ["-y", "example", "--verbose"],
            command: "npx",
            key: "example",
        });

        const second = tomlFormatter.reconcile({
            keyPath: ["mcp_servers"],
            mapper: mapServer,
            servers: [changedServer],
            text: first.text,
        });

        expect(second.statusesByKey.get("example")).toBe("written");
        expect(second.text).toContain("--verbose");
    });

    it("removes a manually added, unrelated server entry, agenteq owns the whole map", () => {
        const first = tomlFormatter.reconcile({
            keyPath: ["mcp_servers"],
            mapper: mapServer,
            servers: [],
            text: '[mcp_servers.hand-added]\ncommand = "something-else"\n',
        });

        expect(first.statusesByKey.get("hand-added")).toBe("removed");
        expect(first.text).not.toContain("hand-added");
    });

    it("skips when an intermediate key holds a scalar value", () => {
        const conflictingText = 'mcp_servers = "not a table"\n';

        const result = tomlFormatter.reconcile({
            keyPath: ["mcp_servers"],
            mapper: mapServer,
            servers: [server],
            text: conflictingText,
        });

        expect(result.statusesByKey.size).toBe(0);
        expect(result.text).toBe(conflictingText);
    });
});
