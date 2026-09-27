import { join } from "node:path";
import { describe, expect, it } from "vitest";
import AgentsFile from "@agents/entities/agents-file.js";

describe("AgentsFile.path", () => {
    it("joins the canonical source directory and the agents filename", () => {
        expect(AgentsFile.path({ cwd: "/repo", sourceDir: ".ai" })).toBe(
            join("/repo", ".ai", "agenteq.json"),
        );
    });
});

describe("AgentsFile.parse", () => {
    it("parses a valid agents file", () => {
        expect(
            AgentsFile.parse('{"agents":["claude_code","cursor"]}')?.agentNames,
        ).toEqual(["claude_code", "cursor"]);
    });

    it("returns null for malformed JSON", () => {
        expect(AgentsFile.parse("not json")).toBeNull();
    });

    it("returns null when `agents` isn't a string array", () => {
        expect(AgentsFile.parse('{"agents":[1,2]}')).toBeNull();
    });

    it("parses saved capabilities", () => {
        expect(
            AgentsFile.parse(
                '{"agents":["claude_code"],"capabilities":["mcp"]}',
            )?.capabilities,
        ).toEqual(["mcp"]);
    });

    it("treats a missing `capabilities` field as undefined", () => {
        expect(
            AgentsFile.parse('{"agents":["claude_code"]}')?.capabilities,
        ).toBeUndefined();
    });

    it("returns null when `capabilities` isn't a string array", () => {
        expect(
            AgentsFile.parse('{"agents":["claude_code"],"capabilities":[1]}'),
        ).toBeNull();
    });
});

describe("AgentsFile#withAgents", () => {
    it("replaces the agent selection", () => {
        const file = AgentsFile.of(["claude_code"], undefined).withAgents(
            ["cursor"],
            ["mcp"],
        );

        expect(file.agentNames).toEqual(["cursor"]);
        expect(file.capabilities).toEqual(["mcp"]);
    });
});

describe("AgentsFile#serialize", () => {
    it("round-trips through parse", () => {
        const serialized = AgentsFile.of(
            ["claude_code", "cursor"],
            undefined,
        ).serialize();

        expect(AgentsFile.parse(serialized)?.agentNames).toEqual([
            "claude_code",
            "cursor",
        ]);
    });

    it("ends with a trailing newline", () => {
        expect(AgentsFile.of(["claude_code"], undefined).serialize()).toMatch(
            /\n$/,
        );
    });
});

describe("AgentsFile remote clone paths", () => {
    it("parses saved clone paths and defaults to none", () => {
        expect(
            AgentsFile.parse('{"agents":[],"remoteClonePaths":{"team":"/a"}}')
                ?.remoteClonePaths,
        ).toEqual({ team: "/a" });

        expect(AgentsFile.parse('{"agents":[]}')?.remoteClonePaths).toEqual({});
    });

    it("serializes clone paths only when there are some", () => {
        const empty = AgentsFile.of(["claude_code"], undefined);

        expect(JSON.parse(empty.serialize())).not.toHaveProperty(
            "remoteClonePaths",
        );

        expect(
            JSON.parse(empty.withRemoteClonePath("team", "/a").serialize())
                .remoteClonePaths,
        ).toEqual({ team: "/a" });
    });

    it("keeps clone paths when the agent selection is replaced", () => {
        const file = AgentsFile.of(["claude_code"], undefined)
            .withRemoteClonePath("team", "/a")
            .withAgents(["cursor"], undefined);

        expect(file.clonePathOf("team")).toBe("/a");
    });

    it("forgets a clone path", () => {
        const file = AgentsFile.empty()
            .withRemoteClonePath("team", "/a")
            .withoutRemoteClonePath("team");

        expect(file.clonePathOf("team")).toBeUndefined();
    });
});
