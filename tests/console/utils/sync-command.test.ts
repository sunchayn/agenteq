import { afterEach, describe, expect, it } from "vitest";
import { resolveCommonSyncOptions } from "@console/utils/sync-command.js";
import artifactsManager from "@artifacts/services/artifacts-manager/index.js";

const ENV_KEYS = [
    "AGENTEQ_ONLY",
    "AGENTEQ_AGENTS",
    "AGENTEQ_YES",
    "AGENTEQ_JSON",
    "AGENTEQ_SOURCE_DIR",
];

afterEach(() => {
    for (const key of ENV_KEYS) {
        delete process.env[key];
    }
});

describe("resolveCommonSyncOptions", () => {
    it("CLI flags take precedence over environment variables", () => {
        process.env.AGENTEQ_AGENTS = "cursor";
        const resolved = resolveCommonSyncOptions({ agents: "claude_code" });

        expect(resolved.agents).toEqual(["claude_code"]);
    });

    it("defaults agents to an empty array with nothing set", () => {
        const resolved = resolveCommonSyncOptions({});

        expect(resolved.agents).toEqual([]);
    });

    it("falls back to environment variables when a flag is absent", () => {
        process.env.AGENTEQ_ONLY = "mcp";
        process.env.AGENTEQ_YES = "1";
        process.env.AGENTEQ_JSON = "true";
        const resolved = resolveCommonSyncOptions({});

        expect(resolved.only).toBe("mcp");
        expect(resolved.shouldSkipPrompts).toBe(true);
        expect(resolved.isJson).toBe(true);
    });

    it("defaults booleans to false with nothing set", () => {
        const resolved = resolveCommonSyncOptions({});

        expect(resolved.shouldSkipPrompts).toBe(false);
        expect(resolved.isJson).toBe(false);
    });

    it("defaults sourceDir to .ai with nothing set", () => {
        const resolved = resolveCommonSyncOptions({});

        expect(resolved.sourceDir).toBe(artifactsManager.DEFAULT_SOURCE_DIR);
    });

    it("falls back to AGENTEQ_SOURCE_DIR when --source-dir is absent", () => {
        process.env.AGENTEQ_SOURCE_DIR = "config/ai";
        const resolved = resolveCommonSyncOptions({});

        expect(resolved.sourceDir).toBe("config/ai");
    });

    it("--source-dir takes precedence over AGENTEQ_SOURCE_DIR", () => {
        process.env.AGENTEQ_SOURCE_DIR = "config/ai";
        const resolved = resolveCommonSyncOptions({ sourceDir: "custom/ai" });

        expect(resolved.sourceDir).toBe("custom/ai");
    });
});
