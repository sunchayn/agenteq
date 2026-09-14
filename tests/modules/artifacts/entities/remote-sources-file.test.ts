import { join } from "node:path";
import { describe, expect, it } from "vitest";
import RemoteSourcesFile from "@artifacts/entities/remote-sources-file.js";

const selection = {
    commands: ["deploy.md"],
    guidelines: true,
    mcp: ["context7"],
    skills: ["writing-tests"],
};

const teamEntry = {
    clonePath: "/home/user/.agenteq/sources/team",
    selection: selection,
    url: "git@github.com:org/team.git",
};

describe("RemoteSourcesFile.path", () => {
    it("joins the canonical source directory and the remote sources filename", () => {
        expect(RemoteSourcesFile.path({ cwd: "/repo", sourceDir: ".ai" })).toBe(
            join("/repo", ".ai", "remote-sources.json"),
        );
    });
});

describe("RemoteSourcesFile.parse", () => {
    it("parses a valid remote sources file with multiple remotes", () => {
        const parsed = RemoteSourcesFile.parse(
            JSON.stringify({
                remotes: {
                    other: {
                        ...teamEntry,
                        url: "git@example.com:org/other.git",
                    },
                    team: teamEntry,
                },
            }),
        );

        expect(parsed.names()).toEqual(["other", "team"]);
        expect(parsed.get("team")).toEqual(teamEntry);
    });

    it("returns an empty file for malformed JSON", () => {
        expect(RemoteSourcesFile.parse("not json").isEmpty()).toBe(true);
    });

    it("returns an empty file when a required field is missing", () => {
        expect(
            RemoteSourcesFile.parse(
                JSON.stringify({
                    remotes: { team: { url: "git@example.com" } },
                }),
            ).isEmpty(),
        ).toBe(true);
    });

    it("returns an empty file when a selection has the wrong shape", () => {
        expect(
            RemoteSourcesFile.parse(
                JSON.stringify({
                    remotes: {
                        team: {
                            clonePath: "/tmp/clone",
                            selection: { commands: "not-an-array" },
                            url: "git@example.com",
                        },
                    },
                }),
            ).isEmpty(),
        ).toBe(true);
    });
});

describe("RemoteSourcesFile mutation helpers", () => {
    it("adds, reads, and removes a named remote immutably", () => {
        const empty = new RemoteSourcesFile();
        const withTeam = empty.withRemote("team", teamEntry);

        expect(empty.isEmpty()).toBe(true);
        expect(withTeam.has("team")).toBe(true);
        expect(withTeam.get("team")).toEqual(teamEntry);

        const withoutTeam = withTeam.withoutRemote("team");

        expect(withoutTeam.isEmpty()).toBe(true);
        expect(withTeam.has("team")).toBe(true);
    });

    it("keeps names in insertion order", () => {
        const file = new RemoteSourcesFile()
            .withRemote("second", teamEntry)
            .withRemote("first", teamEntry);

        expect(file.names()).toEqual(["second", "first"]);
    });
});

describe("RemoteSourcesFile#serialize", () => {
    it("round-trips through parse", () => {
        const serialized = new RemoteSourcesFile({
            team: teamEntry,
        }).serialize();

        const parsed = RemoteSourcesFile.parse(serialized);

        expect(parsed.get("team")).toEqual(teamEntry);
    });

    it("ends with a trailing newline", () => {
        expect(new RemoteSourcesFile({ team: teamEntry }).serialize()).toMatch(
            /\n$/,
        );
    });
});
