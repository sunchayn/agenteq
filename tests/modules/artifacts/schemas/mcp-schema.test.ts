import { describe, expect, it } from "vitest";
import { mcpSchema } from "@artifacts/schemas/mcp-schema.js";

describe("mcpSchema", () => {
    it("accepts a valid stdio config", () => {
        const result = mcpSchema.safeParse({
            config: { args: ["-y", "example"], command: "npx" },
            key: "example",
            type: "stdio",
        });

        expect(result.success).toBe(true);
    });

    it("accepts a stdio config with cwd", () => {
        const result = mcpSchema.safeParse({
            config: { command: "npx", cwd: "./servers/example" },
            key: "example",
            type: "stdio",
        });

        expect(result.success).toBe(true);
    });

    it("accepts a valid sse config with headers", () => {
        const result = mcpSchema.safeParse({
            config: {
                headers: { Authorization: "Bearer token" },
                url: "https://example.com/sse",
            },
            key: "example",
            type: "sse",
        });

        expect(result.success).toBe(true);
    });

    it("accepts a valid http config with headers", () => {
        const result = mcpSchema.safeParse({
            config: {
                headers: { "X-Api-Key": "secret" },
                url: "https://example.com/mcp",
            },
            key: "example",
            type: "http",
        });

        expect(result.success).toBe(true);
    });

    it("rejects an sse config missing url", () => {
        const result = mcpSchema.safeParse({
            config: {},
            key: "example",
            type: "sse",
        });

        expect(result.success).toBe(false);
    });

    it("accepts a valid http config with a $schema field", () => {
        const result = mcpSchema.safeParse({
            $schema: "../../schema/mcp-config.schema.json",
            config: { url: "https://example.com/mcp" },
            key: "example",
            type: "http",
        });

        expect(result.success).toBe(true);
    });

    it("rejects a stdio config missing command", () => {
        const result = mcpSchema.safeParse({
            config: {},
            key: "example",
            type: "stdio",
        });

        expect(result.success).toBe(false);
    });

    it("rejects an http config missing url", () => {
        const result = mcpSchema.safeParse({
            config: {},
            key: "example",
            type: "http",
        });

        expect(result.success).toBe(false);
    });
});
