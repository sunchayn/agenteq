import { join } from "node:path";
import { describe, expect, it } from "vitest";
import SyncManifestFile from "@artifacts/entities/sync-manifest-file.js";

describe("SyncManifestFile.path", () => {
    it("joins the canonical source directory and the sync manifest filename", () => {
        expect(SyncManifestFile.path({ cwd: "/repo", sourceDir: ".ai" })).toBe(
            join("/repo", ".ai", "agenteq-sync-manifest.json"),
        );
    });
});

describe("SyncManifestFile.parse", () => {
    it("parses a valid manifest with multiple artifacts", () => {
        const parsed = SyncManifestFile.parse(
            JSON.stringify({
                artifacts: { "CLAUDE.md": "abc", ".mcp.json": "def" },
            }),
        );

        expect(parsed.hashFor("CLAUDE.md")).toBe("abc");
        expect(parsed.hashFor(".mcp.json")).toBe("def");
    });

    it("returns an empty manifest for malformed JSON", () => {
        expect(SyncManifestFile.parse("not json").hashesByPath).toEqual({});
    });

    it("returns an empty manifest when a hash is not a string", () => {
        expect(
            SyncManifestFile.parse(
                JSON.stringify({ artifacts: { "CLAUDE.md": 123 } }),
            ).hashesByPath,
        ).toEqual({});
    });
});

describe("SyncManifestFile#hashFor", () => {
    it("returns undefined for a path never recorded", () => {
        expect(new SyncManifestFile().hashFor("CLAUDE.md")).toBeUndefined();
    });
});

describe("SyncManifestFile#serialize", () => {
    it("round-trips through parse", () => {
        const serialized = new SyncManifestFile({
            "CLAUDE.md": "abc",
        }).serialize();

        expect(SyncManifestFile.parse(serialized).hashFor("CLAUDE.md")).toBe(
            "abc",
        );
    });

    it("ends with a trailing newline", () => {
        expect(
            new SyncManifestFile({ "CLAUDE.md": "abc" }).serialize(),
        ).toMatch(/\n$/);
    });
});
