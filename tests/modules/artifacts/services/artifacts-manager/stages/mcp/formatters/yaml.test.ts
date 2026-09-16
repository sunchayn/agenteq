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
        const result = yamlFormatter.reconcile({
            keyPath: ["extensions"],
            mapper: mapServer,
            servers: [server],
            text: "",
        });

        expect(result.statusesByKey.get("example")).toBe("written");
        expect(result.text).toContain("extensions:");
        expect(result.text).toContain("command: npx");
    });

    it("preserves other top-level keys already present in the file", () => {
        const result = yamlFormatter.reconcile({
            keyPath: ["extensions"],
            mapper: mapServer,
            servers: [server],
            text: "model: gpt-5\n",
        });

        expect(result.text).toContain("model: gpt-5");
        expect(result.text).toContain("extensions:");
    });

    it("skips an entry that already matches", () => {
        const first = yamlFormatter.reconcile({
            keyPath: ["extensions"],
            mapper: mapServer,
            servers: [server],
            text: "",
        });

        const second = yamlFormatter.reconcile({
            keyPath: ["extensions"],
            mapper: mapServer,
            servers: [server],
            text: first.text,
        });

        expect(second.statusesByKey.get("example")).toBe("skipped");
    });

    it("re-writes an entry whose canonical config changed since it was last synced", () => {
        const first = yamlFormatter.reconcile({
            keyPath: ["extensions"],
            mapper: mapServer,
            servers: [server],
            text: "",
        });

        const changedServer = new McpStdioServer({
            args: ["-y", "example", "--verbose"],
            command: "npx",
            key: "example",
        });

        const second = yamlFormatter.reconcile({
            keyPath: ["extensions"],
            mapper: mapServer,
            servers: [changedServer],
            text: first.text,
        });

        expect(second.statusesByKey.get("example")).toBe("written");
        expect(second.text).toContain("--verbose");
    });

    it("removes a manually added, unrelated server entry, agenteq owns the whole map", () => {
        const first = yamlFormatter.reconcile({
            keyPath: ["extensions"],
            mapper: mapServer,
            servers: [],
            text: "extensions:\n  hand-added:\n    command: something-else\n",
        });

        expect(first.statusesByKey.get("hand-added")).toBe("removed");
        expect(first.text).not.toContain("hand-added");
    });

    it("skips when an intermediate key holds a scalar value", () => {
        const conflictingText = "extensions: just a string\n";

        const result = yamlFormatter.reconcile({
            keyPath: ["extensions"],
            mapper: mapServer,
            servers: [server],
            text: conflictingText,
        });

        expect(result.statusesByKey.size).toBe(0);
        expect(result.text).toBe(conflictingText);
    });
});
