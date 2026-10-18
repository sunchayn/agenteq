import { join } from "node:path";
import { describe, expect, it } from "vitest";
import CopiedFilesFile from "@artifacts/entities/copied-files-file.js";

describe("CopiedFilesFile.path", () => {
    it("joins the canonical source directory and the copied files filename", () => {
        expect(CopiedFilesFile.path({ cwd: "/repo", sourceDir: ".ai" })).toBe(
            join("/repo", ".ai", "agenteq-copied-files.json"),
        );
    });
});

describe("CopiedFilesFile.parse", () => {
    it("parses a valid file with multiple capabilities", () => {
        const parsed = CopiedFilesFile.parse(
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

    it("returns an empty file for malformed JSON", () => {
        expect(CopiedFilesFile.parse("not json").pathsFor("skills")).toEqual(
            [],
        );
    });

    it("returns an empty file when a path is not a string", () => {
        expect(
            CopiedFilesFile.parse(
                JSON.stringify({ pathsByCapability: { skills: [123] } }),
            ).pathsFor("skills"),
        ).toEqual([]);
    });
});

describe("CopiedFilesFile#pathsFor", () => {
    it("returns an empty array for a capability never recorded", () => {
        expect(new CopiedFilesFile().pathsFor("skills")).toEqual([]);
    });
});

describe("CopiedFilesFile#withCapability", () => {
    it("replaces one capability's paths, leaving the rest untouched", () => {
        const file = new CopiedFilesFile({
            commands: [".test/commands/b.md"],
            skills: [".test/skills/a/SKILL.md"],
        }).withCapability("skills", [".test/skills/c/SKILL.md"]);

        expect(file.pathsFor("skills")).toEqual([".test/skills/c/SKILL.md"]);
        expect(file.pathsFor("commands")).toEqual([".test/commands/b.md"]);
    });
});

describe("CopiedFilesFile#serialize", () => {
    it("round-trips through parse", () => {
        const serialized = new CopiedFilesFile({
            skills: [".test/skills/a/SKILL.md"],
        }).serialize();

        expect(CopiedFilesFile.parse(serialized).pathsFor("skills")).toEqual([
            ".test/skills/a/SKILL.md",
        ]);
    });

    it("ends with a trailing newline", () => {
        expect(
            new CopiedFilesFile({
                skills: [".test/skills/a/SKILL.md"],
            }).serialize(),
        ).toMatch(/\n$/);
    });
});
