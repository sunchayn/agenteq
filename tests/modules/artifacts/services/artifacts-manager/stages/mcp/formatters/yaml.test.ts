import { describe, expect, it } from "vitest";
import { yamlFormatter } from "@artifacts/services/artifacts-manager/stages/mcp/formatters.js";
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

describe("yamlFormatter", () => {
    it("writes a new server entry as YAML", () => {
        const result = yamlFormatter.apply({
            config: server,
            keyPath: ["extensions"],
            mapper: mapServer,
            text: "",
        });

        expect(result.status).toBe("written");
        expect(result.text).toContain("extensions:");
        expect(result.text).toContain("command: npx");
    });

    it("preserves other top-level keys already present in the file", () => {
        const result = yamlFormatter.apply({
            config: server,
            keyPath: ["extensions"],
            mapper: mapServer,
            text: "model: gpt-5\n",
        });

        expect(result.text).toContain("model: gpt-5");
        expect(result.text).toContain("extensions:");
    });

    it("skips an entry that already exists", () => {
        const first = yamlFormatter.apply({
            config: server,
            keyPath: ["extensions"],
            mapper: mapServer,
            text: "",
        });

        const second = yamlFormatter.apply({
            config: server,
            keyPath: ["extensions"],
            mapper: mapServer,
            text: first.text,
        });

        expect(second.status).toBe("skipped");
    });

    it("skips when an intermediate key holds a scalar value", () => {
        const conflictingText = "extensions: just a string\n";

        const result = yamlFormatter.apply({
            config: server,
            keyPath: ["extensions"],
            mapper: mapServer,
            text: conflictingText,
        });

        expect(result.status).toBe("skipped");
        expect(result.text).toBe(conflictingText);
    });
});
