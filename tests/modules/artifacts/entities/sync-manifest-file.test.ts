import { join } from "node:path";
import { describe, expect, it } from "vitest";
import SyncManifestFile from "@artifacts/entities/sync-manifest-file.js";

describe("SyncManifestFile.path", () => {
    it("joins the canonical source directory and the sync manifest filename", () => {
        expect(SyncManifestFile.path({ cwd: "/repo", sourceDir: ".ai" })).toBe(
            join("/repo", ".ai", "agenteq", "sync-manifest.json"),
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

    it("parses a valid manifest with multiple capabilities", () => {
        const parsed = SyncManifestFile.parse(
            JSON.stringify({
                pathsByCapability: {
                    commands: [".test/commands/b.md"],
                    skills: [".test/skills/a/SKILL.md"],
                },
            }),
        );

        expect(parsed.pathsFor("skills")).toEqual([".test/skills/a/SKILL.md"]);
        expect(parsed.pathsFor("commands")).toEqual([".test/commands/b.md"]);
    });

    it("parses a manifest holding both artifacts and capability paths together", () => {
        const parsed = SyncManifestFile.parse(
            JSON.stringify({
                artifacts: { "CLAUDE.md": "abc" },
                pathsByCapability: { skills: [".test/skills/a/SKILL.md"] },
            }),
        );

        expect(parsed.hashFor("CLAUDE.md")).toBe("abc");
        expect(parsed.pathsFor("skills")).toEqual([".test/skills/a/SKILL.md"]);
    });

    it("returns an empty manifest for malformed JSON", () => {
        const parsed = SyncManifestFile.parse("not json");

        expect(parsed.hashesByPath).toEqual({});
        expect(parsed.pathsByCapability).toEqual({});
    });

    it("returns an empty manifest when a hash is not a string", () => {
        expect(
            SyncManifestFile.parse(
                JSON.stringify({ artifacts: { "CLAUDE.md": 123 } }),
            ).hashesByPath,
        ).toEqual({});
    });

    it("returns an empty manifest when a capability path is not a string", () => {
        expect(
            SyncManifestFile.parse(
                JSON.stringify({ pathsByCapability: { skills: [123] } }),
            ).pathsByCapability,
        ).toEqual({});
    });
});

describe("SyncManifestFile#hashFor", () => {
    it("returns undefined for a path never recorded", () => {
        expect(new SyncManifestFile().hashFor("CLAUDE.md")).toBeUndefined();
    });
});

describe("SyncManifestFile#pathsFor", () => {
    it("returns an empty array for a capability never recorded", () => {
        expect(new SyncManifestFile().pathsFor("skills")).toEqual([]);
    });
});

describe("SyncManifestFile#withHashes", () => {
    it("replaces the hashes, leaving capability paths untouched", () => {
        const file = new SyncManifestFile(
            { "CLAUDE.md": "abc" },
            { skills: [".test/skills/a/SKILL.md"] },
        ).withHashes({ "CLAUDE.md": "def" });

        expect(file.hashFor("CLAUDE.md")).toBe("def");
        expect(file.pathsFor("skills")).toEqual([".test/skills/a/SKILL.md"]);
    });
});

describe("SyncManifestFile#withCapability", () => {
    it("replaces one capability's paths, leaving the rest and the hashes untouched", () => {
        const file = new SyncManifestFile(
            { "CLAUDE.md": "abc" },
            {
                commands: [".test/commands/b.md"],
                skills: [".test/skills/a/SKILL.md"],
            },
        ).withCapability("skills", [".test/skills/c/SKILL.md"]);

        expect(file.pathsFor("skills")).toEqual([".test/skills/c/SKILL.md"]);
        expect(file.pathsFor("commands")).toEqual([".test/commands/b.md"]);
        expect(file.hashFor("CLAUDE.md")).toBe("abc");
    });
});

describe("SyncManifestFile#serialize", () => {
    it("round-trips through parse", () => {
        const serialized = new SyncManifestFile(
            { "CLAUDE.md": "abc" },
            { skills: [".test/skills/a/SKILL.md"] },
        ).serialize();

        const parsed = SyncManifestFile.parse(serialized);

        expect(parsed.hashFor("CLAUDE.md")).toBe("abc");
        expect(parsed.pathsFor("skills")).toEqual([".test/skills/a/SKILL.md"]);
    });

    it("ends with a trailing newline", () => {
        expect(
            new SyncManifestFile({ "CLAUDE.md": "abc" }).serialize(),
        ).toMatch(/\n$/);
    });

    it("saving hashes after loading capability paths preserves those paths on disk", () => {
        const loaded = SyncManifestFile.parse(
            JSON.stringify({
                pathsByCapability: { skills: [".test/skills/a/SKILL.md"] },
            }),
        );

        const saved = SyncManifestFile.parse(
            loaded.withHashes({ "CLAUDE.md": "abc" }).serialize(),
        );

        expect(saved.hashFor("CLAUDE.md")).toBe("abc");
        expect(saved.pathsFor("skills")).toEqual([".test/skills/a/SKILL.md"]);
    });

    it("saving capability paths after loading hashes preserves those hashes on disk", () => {
        const loaded = SyncManifestFile.parse(
            JSON.stringify({ artifacts: { "CLAUDE.md": "abc" } }),
        );

        const saved = SyncManifestFile.parse(
            loaded
                .withCapability("skills", [".test/skills/a/SKILL.md"])
                .serialize(),
        );

        expect(saved.hashFor("CLAUDE.md")).toBe("abc");
        expect(saved.pathsFor("skills")).toEqual([".test/skills/a/SKILL.md"]);
    });
});
