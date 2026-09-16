import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import discoverRemoteCapabilitiesAction from "@artifacts/actions/discover-remote-capabilities-action.js";

let rootDir: string;

beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "agenteq-remote-root-"));
});

afterEach(async () => {
    await rm(rootDir, { force: true, recursive: true });
});

describe("discoverRemoteCapabilitiesAction", () => {
    it("reports nothing found in an empty root", async () => {
        const result = await discoverRemoteCapabilitiesAction({
            rootDir: rootDir,
        });

        expect(result).toEqual({
            commands: [],
            hasGuidelines: false,
            mcp: [],
            skills: [],
        });
    });

    it("lists every skill directory at the root of skills/", async () => {
        await mkdir(join(rootDir, "skills/writing-tests"), {
            recursive: true,
        });

        await writeFile(
            join(rootDir, "skills/writing-tests/SKILL.md"),
            "hello",
        );

        const result = await discoverRemoteCapabilitiesAction({
            rootDir: rootDir,
        });

        expect(result.skills).toEqual(["writing-tests"]);
    });

    it("lists every command file under commands/", async () => {
        await mkdir(join(rootDir, "commands"), { recursive: true });
        await writeFile(join(rootDir, "commands/deploy.md"), "hello");

        const result = await discoverRemoteCapabilitiesAction({
            rootDir: rootDir,
        });

        expect(result.commands).toEqual(["deploy.md"]);
    });

    it("lists every mcp server key under mcp/", async () => {
        await mkdir(join(rootDir, "mcp/context7"), { recursive: true });
        await writeFile(
            join(rootDir, "mcp/context7/config.json"),
            JSON.stringify({
                config: { command: "npx" },
                key: "context7",
                type: "stdio",
            }),
        );

        const result = await discoverRemoteCapabilitiesAction({
            rootDir: rootDir,
        });

        expect(result.mcp).toEqual(["context7"]);
    });

    it("reports guidelines as present when GUIDELINES.md exists at the root", async () => {
        await writeFile(join(rootDir, "GUIDELINES.md"), "# Hello");

        const result = await discoverRemoteCapabilitiesAction({
            rootDir: rootDir,
        });

        expect(result.hasGuidelines).toBe(true);
    });
});
