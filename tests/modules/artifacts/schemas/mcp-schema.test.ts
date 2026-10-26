import { describe, expect, it } from "vitest";
import { mcpSchema } from "@artifacts/schemas/mcp-schema.js";

describe("mcpSchema", () => {
    it("accepts a valid stdio config", () => {
        const result = mcpSchema.safeParse({
            config: { args: ["-y", "example"], command: "npx" },
            type: "stdio",
        });

        expect(result.success).toBe(true);
    });

    it("accepts a stdio config with cwd", () => {
        const result = mcpSchema.safeParse({
            config: { command: "npx", cwd: "./servers/example" },
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
            type: "http",
        });

        expect(result.success).toBe(true);
    });

    it("rejects an sse config missing url", () => {
        const result = mcpSchema.safeParse({
            config: {},
            type: "sse",
        });

        expect(result.success).toBe(false);
    });

    it("accepts a valid http config with a $schema field", () => {
        const result = mcpSchema.safeParse({
            $schema: "../../schema/mcp-config.schema.json",
            config: { url: "https://example.com/mcp" },
            type: "http",
        });

        expect(result.success).toBe(true);
    });

    it("rejects a stdio config missing command", () => {
        const result = mcpSchema.safeParse({
            config: {},
            type: "stdio",
        });

        expect(result.success).toBe(false);
    });

    it("rejects an http config missing url", () => {
        const result = mcpSchema.safeParse({
            config: {},
            type: "http",
        });

        expect(result.success).toBe(false);
    });

    it("accepts a stdio config with a single envFile path", () => {
        const result = mcpSchema.safeParse({
            config: { command: "npx", envFile: ".env" },
            type: "stdio",
        });

        expect(result.success).toBe(true);
    });

    it("accepts a stdio config with an envFile list", () => {
        const result = mcpSchema.safeParse({
            config: { command: "npx", envFile: [".env", ".env.local"] },
            type: "stdio",
        });

        expect(result.success).toBe(true);
    });

    it("accepts an http config with an envFile list", () => {
        const result = mcpSchema.safeParse({
            config: { envFile: [".env"], url: "https://example.com/mcp" },
            type: "http",
        });

        expect(result.success).toBe(true);
    });
});
