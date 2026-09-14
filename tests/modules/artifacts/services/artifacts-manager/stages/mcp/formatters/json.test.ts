import { describe, expect, it } from "vitest";
import { jsonFormatter } from "@artifacts/services/artifacts-manager/stages/mcp/formatters.js";
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

describe("jsonFormatter", () => {
    it("writes a new server entry into an empty file", () => {
        const result = jsonFormatter.reconcile({
            keyPath: ["mcpServers"],
            mapper: mapServer,
            servers: [server],
            text: "",
        });

        expect(result.statusesByKey.get("example")).toBe("written");
        expect(JSON.parse(result.text).mcpServers.example).toEqual({
            args: ["-y", "example"],
            command: "npx",
        });
    });

    it("skips an entry that already matches, returning the text unchanged", () => {
        const first = jsonFormatter.reconcile({
            keyPath: ["mcpServers"],
            mapper: mapServer,
            servers: [server],
            text: "",
        });

        const second = jsonFormatter.reconcile({
            keyPath: ["mcpServers"],
            mapper: mapServer,
            servers: [server],
            text: first.text,
        });

        expect(second.statusesByKey.get("example")).toBe("skipped");
        expect(second.text).toBe(first.text);
    });

    it("re-writes an entry whose canonical config changed since it was last synced", () => {
        const first = jsonFormatter.reconcile({
            keyPath: ["mcpServers"],
            mapper: mapServer,
            servers: [server],
            text: "",
        });

        const changedServer = new McpStdioServer({
            args: ["-y", "example", "--verbose"],
            command: "npx",
            key: "example",
        });

        const second = jsonFormatter.reconcile({
            keyPath: ["mcpServers"],
            mapper: mapServer,
            servers: [changedServer],
            text: first.text,
        });

        expect(second.statusesByKey.get("example")).toBe("written");
        expect(JSON.parse(second.text).mcpServers.example).toEqual({
            args: ["-y", "example", "--verbose"],
            command: "npx",
        });
    });

    it("removes a manually added, unrelated server entry, agenteq owns the whole map", () => {
        const text = JSON.stringify({
            mcpServers: { "hand-added": { command: "something-else" } },
        });

        const result = jsonFormatter.reconcile({
            keyPath: ["mcpServers"],
            mapper: mapServer,
            servers: [server],
            text: text,
        });

        const written = JSON.parse(result.text);

        expect(written.mcpServers["hand-added"]).toBeUndefined();
        expect(result.statusesByKey.get("hand-added")).toBe("removed");
        expect(written.mcpServers.example).toEqual({
            args: ["-y", "example"],
            command: "npx",
        });
    });

    it("removes a stale canonical entry no longer part of the desired set", () => {
        const first = jsonFormatter.reconcile({
            keyPath: ["mcpServers"],
            mapper: mapServer,
            servers: [server],
            text: "",
        });

        const second = jsonFormatter.reconcile({
            keyPath: ["mcpServers"],
            mapper: mapServer,
            servers: [],
            text: first.text,
        });

        expect(second.statusesByKey.get("example")).toBe("removed");
        expect(JSON.parse(second.text).mcpServers).toEqual({});
    });

    it("writes into a nested key path without clobbering sibling keys", () => {
        const result = jsonFormatter.reconcile({
            keyPath: ["amp", "mcpServers"],
            mapper: mapServer,
            servers: [server],
            text: JSON.stringify({ amp: { otherSetting: true } }),
        });

        const written = JSON.parse(result.text);

        expect(written.amp.otherSetting).toBe(true);
        expect(written.amp.mcpServers.example).toEqual({
            args: ["-y", "example"],
            command: "npx",
        });
    });

    it("skips when an intermediate key holds a scalar value", () => {
        const conflictingText = JSON.stringify({ mcpServers: "not an object" });

        const result = jsonFormatter.reconcile({
            keyPath: ["mcpServers"],
            mapper: mapServer,
            servers: [server],
            text: conflictingText,
        });

        expect(result.statusesByKey.size).toBe(0);
        expect(result.text).toBe(conflictingText);
    });
});
