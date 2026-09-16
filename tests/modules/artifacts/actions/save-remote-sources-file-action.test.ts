import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import saveRemoteSourcesFileAction from "@artifacts/actions/save-remote-sources-file-action.js";
import RemoteSourcesFile from "@artifacts/entities/remote-sources-file.js";
import type { RunContext } from "@shared/types/run-context.js";

const selection = {
    commands: [],
    guidelines: true,
    mcp: [],
    skills: ["writing-tests"],
};

const remotes = {
    team: {
        clonePath: "/tmp/clone",
        selection: selection,
        url: "git@example.com",
    },
};

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-save-remote-sources-file-"));
    context = { cwd: cwd, sourceDir: ".ai" };
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("saveRemoteSourcesFileAction", () => {
    it("round-trips a saved remote sources file", async () => {
        await saveRemoteSourcesFileAction({
            context: context,
            remotes: remotes,
            shouldIgnore: false,
        });

        const raw = await readFile(RemoteSourcesFile.path(context), "utf8");

        expect(JSON.parse(raw).remotes.team.url).toBe("git@example.com");
        expect(JSON.parse(raw).remotes.team.selection).toEqual(selection);
    });

    it("does not touch .gitignore when shouldIgnore is false", async () => {
        await saveRemoteSourcesFileAction({
            context: context,
            remotes: remotes,
            shouldIgnore: false,
        });

        await expect(
            readFile(join(cwd, ".gitignore"), "utf8"),
        ).rejects.toThrow();
    });

    it("adds the file path to .gitignore on first write when shouldIgnore is true", async () => {
        await saveRemoteSourcesFileAction({
            context: context,
            remotes: remotes,
            shouldIgnore: true,
        });

        const gitignore = await readFile(join(cwd, ".gitignore"), "utf8");

        expect(gitignore).toContain(".ai/remote-sources.json");
    });

    it("does not touch .gitignore again on a subsequent write", async () => {
        await saveRemoteSourcesFileAction({
            context: context,
            remotes: remotes,
            shouldIgnore: true,
        });

        const first = await readFile(join(cwd, ".gitignore"), "utf8");

        await saveRemoteSourcesFileAction({
            context: context,
            remotes: {
                team: { ...remotes.team, url: "git@other-example.com" },
            },
            shouldIgnore: true,
        });

        const second = await readFile(join(cwd, ".gitignore"), "utf8");

        expect(second).toBe(first);
    });
});
