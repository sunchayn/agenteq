import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import saveAgentsFileAction from "@agents/actions/save-agents-file-action.js";
import saveRemoteClonePathAction from "@agents/actions/save-remote-clone-path-action.js";
import resolveSavedAgentsAction from "@agents/actions/resolve-saved-agents-action.js";
import AgentsFile from "@agents/entities/agents-file.js";
import type { RunContext } from "@shared/types/run-context.js";

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-save-clone-path-"));
    context = { cwd: cwd, sourceDir: ".ai" };
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

async function readSaved(): Promise<AgentsFile | null> {
    return AgentsFile.parse(await readFile(AgentsFile.path(context), "utf8"));
}

describe("saveRemoteClonePathAction", () => {
    it("saves the path and gitignores the file when none existed", async () => {
        await saveRemoteClonePathAction({
            context: context,
            name: "team",
            path: "/a",
        });

        expect((await readSaved())?.clonePathOf("team")).toBe("/a");

        expect(await readFile(join(cwd, ".gitignore"), "utf8")).toContain(
            ".ai/agenteq.json",
        );
    });

    it("does not make the project look initialized", async () => {
        await saveRemoteClonePathAction({
            context: context,
            name: "team",
            path: "/a",
        });

        expect(await resolveSavedAgentsAction({ context: context })).toBe(
            undefined,
        );
    });

    it("keeps saved agents and other paths", async () => {
        await saveAgentsFileAction({
            agentNames: ["claude_code"],
            capabilities: [],
            context: context,
        });

        await saveRemoteClonePathAction({
            context: context,
            name: "a",
            path: "/a",
        });

        await saveRemoteClonePathAction({
            context: context,
            name: "b",
            path: "/b",
        });

        const saved = await readSaved();

        expect(saved?.agentNames).toEqual(["claude_code"]);
        expect(saved?.remoteClonePaths).toEqual({ a: "/a", b: "/b" });
    });

    it("forgets the path when none is given", async () => {
        await saveRemoteClonePathAction({
            context: context,
            name: "team",
            path: "/a",
        });

        await saveRemoteClonePathAction({ context: context, name: "team" });

        expect((await readSaved())?.clonePathOf("team")).toBeUndefined();
    });
});
