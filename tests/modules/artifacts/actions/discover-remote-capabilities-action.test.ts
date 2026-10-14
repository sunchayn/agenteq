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

    it("namespaces a skill nested under a classified sub-folder, alongside a root one", async () => {
        await mkdir(join(rootDir, "skills/writing-tests"), {
            recursive: true,
        });

        await writeFile(
            join(rootDir, "skills/writing-tests/SKILL.md"),
            "hello",
        );

        await mkdir(join(rootDir, "backend/skills/backend-example"), {
            recursive: true,
        });

        await writeFile(
            join(rootDir, "backend/skills/backend-example/SKILL.md"),
            "hello",
        );

        const result = await discoverRemoteCapabilitiesAction({
            rootDir: rootDir,
        });

        expect(result.skills.sort()).toEqual([
            "backend::backend-example",
            "writing-tests",
        ]);
    });

    it("namespaces a command nested under a classified sub-folder, alongside a root one", async () => {
        await mkdir(join(rootDir, "commands"), { recursive: true });
        await writeFile(join(rootDir, "commands/deploy.md"), "hello");

        await mkdir(join(rootDir, "backend/commands"), { recursive: true });
        await writeFile(join(rootDir, "backend/commands/deploy.md"), "hello");

        const result = await discoverRemoteCapabilitiesAction({
            rootDir: rootDir,
        });

        expect(result.commands.sort()).toEqual([
            "backend::deploy.md",
            "deploy.md",
        ]);
    });

    it("namespaces an mcp server nested under a classified sub-folder, by its directory name", async () => {
        await mkdir(join(rootDir, "mcp/root-server"), { recursive: true });
        await writeFile(
            join(rootDir, "mcp/root-server/config.json"),
            JSON.stringify({
                config: { command: "npx" },
                type: "stdio",
            }),
        );

        await mkdir(join(rootDir, "backend/mcp/backend-shared-server"), {
            recursive: true,
        });

        await writeFile(
            join(rootDir, "backend/mcp/backend-shared-server/config.json"),
            JSON.stringify({
                config: { command: "npx" },
                type: "stdio",
            }),
        );

        const result = await discoverRemoteCapabilitiesAction({
            rootDir: rootDir,
        });

        expect(result.mcp.sort()).toEqual([
            "backend::backend-shared-server",
            "root-server",
        ]);
    });

    it("keeps two same-name mcp servers in different namespaces distinguishable", async () => {
        await mkdir(join(rootDir, "backend/mcp/shared"), {
            recursive: true,
        });

        await writeFile(
            join(rootDir, "backend/mcp/shared/config.json"),
            JSON.stringify({
                config: { command: "npx" },
                type: "stdio",
            }),
        );

        await mkdir(join(rootDir, "frontend/mcp/shared"), {
            recursive: true,
        });

        await writeFile(
            join(rootDir, "frontend/mcp/shared/config.json"),
            JSON.stringify({
                config: { command: "npx" },
                type: "stdio",
            }),
        );

        const result = await discoverRemoteCapabilitiesAction({
            rootDir: rootDir,
        });

        expect(result.mcp.sort()).toEqual([
            "backend::shared",
            "frontend::shared",
        ]);
    });
});
