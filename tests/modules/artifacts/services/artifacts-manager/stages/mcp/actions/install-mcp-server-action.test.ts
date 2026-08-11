import { describe, expect, it } from "vitest";
import installMcpServerAction from "@artifacts/services/artifacts-manager/stages/mcp/actions/install-mcp-server-action.js";
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

const tomlMcp = createMcpConfiguration({
    configKey: "mcp_servers",
    configPath: "config.toml",
    entryMappers: testEntryMappers,
});

const yamlMcp = createMcpConfiguration({
    configKey: "extensions",
    configPath: "config.yaml",
    entryMappers: testEntryMappers,
});

const server = new McpStdioServer({
    args: ["-y", "example"],
    command: "npx",
    key: "example",
});

describe("installMcpServerAction (json)", () => {
    it("writes a new server entry into the given text", () => {
        const result = installMcpServerAction({
            format: ConfigFileFormat.Json,
            mcp: jsonMcp,
            server: server,
            text: "",
        });

        expect(result.status).toBe("written");
        expect(JSON.parse(result.text).mcpServers.example).toEqual({
            args: ["-y", "example"],
            command: "npx",
        });
    });

    it("skips an entry that already exists", () => {
        const first = installMcpServerAction({
            format: ConfigFileFormat.Json,
            mcp: jsonMcp,
            server: server,
            text: "",
        });

        const second = installMcpServerAction({
            format: ConfigFileFormat.Json,
            mcp: jsonMcp,
            server: server,
            text: first.text,
        });

        expect(second.status).toBe("skipped");
    });

    it("preserves an existing distinct entry when adding a new one", () => {
        const first = installMcpServerAction({
            format: ConfigFileFormat.Json,
            mcp: jsonMcp,
            server: server,
            text: "",
        });

        const second = installMcpServerAction({
            format: ConfigFileFormat.Json,
            mcp: jsonMcp,
            server: new McpStdioServer({ command: "other", key: "second" }),
            text: first.text,
        });

        expect(Object.keys(JSON.parse(second.text).mcpServers).sort()).toEqual([
            "example",
            "second",
        ]);
    });

    it("writes into a nested table without clobbering sibling keys", () => {
        const result = installMcpServerAction({
            format: ConfigFileFormat.Json,
            mcp: nestedJsonMcp,
            server: server,
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

describe("installMcpServerAction (format detection by extension)", () => {
    it("writes a new server entry as TOML when the format is toml", () => {
        const result = installMcpServerAction({
            format: ConfigFileFormat.Toml,
            mcp: tomlMcp,
            server: server,
            text: "",
        });

        expect(result.text).toContain("[mcp_servers.example]");
        expect(result.text).toContain('command = "npx"');
    });

    it("writes a new server entry as YAML when the format is yaml", () => {
        const result = installMcpServerAction({
            format: ConfigFileFormat.Yaml,
            mcp: yamlMcp,
            server: server,
            text: "",
        });

        expect(result.text).toContain("extensions:");
        expect(result.text).toContain("command: npx");
    });
});
