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
        const result = jsonFormatter.apply({
            config: server,
            keyPath: ["mcpServers"],
            mapper: mapServer,
            text: "",
        });

        expect(result.status).toBe("written");
        expect(JSON.parse(result.text).mcpServers.example).toEqual({
            args: ["-y", "example"],
            command: "npx",
        });
    });

    it("skips an entry that already exists, returning the text unchanged", () => {
        const first = jsonFormatter.apply({
            config: server,
            keyPath: ["mcpServers"],
            mapper: mapServer,
            text: "",
        });

        const second = jsonFormatter.apply({
            config: server,
            keyPath: ["mcpServers"],
            mapper: mapServer,
            text: first.text,
        });

        expect(second.status).toBe("skipped");
        expect(second.text).toBe(first.text);
    });

    it("writes into a nested key path without clobbering sibling keys", () => {
        const result = jsonFormatter.apply({
            config: server,
            keyPath: ["amp", "mcpServers"],
            mapper: mapServer,
            text: JSON.stringify({ amp: { otherSetting: true } }),
        });

        const written = JSON.parse(result.text);

        expect(written.amp.otherSetting).toBe(true);
        expect(written.amp.mcpServers.example).toEqual({
            args: ["-y", "example"],
            command: "npx",
        });
    });
});
