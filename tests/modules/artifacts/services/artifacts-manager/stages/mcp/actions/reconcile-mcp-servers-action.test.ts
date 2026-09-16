import { describe, expect, it } from "vitest";
import reconcileMcpServersAction from "@artifacts/services/artifacts-manager/stages/mcp/actions/reconcile-mcp-servers-action.js";
import { createMcpConfiguration } from "@agents/types/mcp-configuration.js";
import type { McpServerMappers } from "@agents/types/mcp-server-mapper.js";
import { McpStdioServer } from "@agents/entities/mcp-server.js";
import { ConfigFileFormat } from "@artifacts/enums/config-file-format.js";

const testEntryMappers: McpServerMappers = {
    remote: () => ({}),
    stdio: (server) => ({ args: server.args ?? [], command: server.command }),
};

const jsonMcp = createMcpConfiguration({
    configPath: ".mcp.json",
    entryMappers: testEntryMappers,
});

const nestedJsonMcp = createMcpConfiguration({
    configKey: ["amp", "mcpServers"],
    configPath: "settings.json",
    entryMappers: testEntryMappers,
});

const server = new McpStdioServer({
    args: ["-y", "example"],
    command: "npx",
    key: "example",
});

describe("reconcileMcpServersAction", () => {
    it("writes a new server entry into the given text", () => {
        const result = reconcileMcpServersAction({
            format: ConfigFileFormat.Json,
            mcp: jsonMcp,
            servers: [server],
            text: "",
        });

        expect(result.statusesByKey.get("example")).toBe("written");
        expect(JSON.parse(result.text).mcpServers.example).toEqual({
            args: ["-y", "example"],
            command: "npx",
        });
    });

    it("skips an entry that already exists", () => {
        const first = reconcileMcpServersAction({
            format: ConfigFileFormat.Json,
            mcp: jsonMcp,
            servers: [server],
            text: "",
        });

        const second = reconcileMcpServersAction({
            format: ConfigFileFormat.Json,
            mcp: jsonMcp,
            servers: [server],
            text: first.text,
        });

        expect(second.statusesByKey.get("example")).toBe("skipped");
    });

    it("removes a hand-added entry that isn't part of the canonical set", () => {
        const first = reconcileMcpServersAction({
            format: ConfigFileFormat.Json,
            mcp: jsonMcp,
            servers: [server],
            text: JSON.stringify({
                mcpServers: { "hand-added": { command: "other" } },
            }),
        });

        expect(first.statusesByKey.get("hand-added")).toBe("removed");
        expect(JSON.parse(first.text).mcpServers["hand-added"]).toBeUndefined();
    });

    it("keeps a second canonical entry when installing a new one", () => {
        const second = new McpStdioServer({ command: "other", key: "second" });

        const result = reconcileMcpServersAction({
            format: ConfigFileFormat.Json,
            mcp: jsonMcp,
            servers: [server, second],
            text: "",
        });

        expect(Object.keys(JSON.parse(result.text).mcpServers).sort()).toEqual([
            "example",
            "second",
        ]);
    });

    it("writes into a nested table without clobbering sibling keys", () => {
        const result = reconcileMcpServersAction({
            format: ConfigFileFormat.Json,
            mcp: nestedJsonMcp,
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
});
