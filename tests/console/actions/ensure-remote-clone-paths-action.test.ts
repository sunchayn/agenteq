import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import input from "@infrastructure/terminal/input.js";
import ensureRemoteClonePathsAction from "@console/actions/ensure-remote-clone-paths-action.js";
import saveRemoteClonePathAction from "@agents/actions/save-remote-clone-path-action.js";
import saveRemoteSourcesFileAction from "@artifacts/actions/save-remote-sources-file-action.js";
import AgentsFile from "@agents/entities/agents-file.js";
import type { RunContext } from "@shared/types/run-context.js";

const selection = { commands: [], guidelines: true, mcp: [], skills: [] };

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-ensure-clone-paths-"));
    context = { cwd: cwd, sourceDir: ".ai" };

    await saveRemoteSourcesFileAction({
        context: context,
        remotes: {
            saved: { selection: selection, url: "u1" },
            unsaved: { selection: selection, url: "u2" },
        },
        shouldIgnore: false,
    });

    await saveRemoteClonePathAction({
        context: context,
        name: "saved",
        path: "/already",
    });
});

afterEach(async () => {
    vi.restoreAllMocks();
    await rm(cwd, { force: true, recursive: true });
});

describe("ensureRemoteClonePathsAction", () => {
    it("asks only for remotes with no saved path and saves the answer", async () => {
        vi.spyOn(input, "isInteractive").mockReturnValue(true);
        const text = vi.spyOn(input, "text").mockResolvedValue("/picked");

        await ensureRemoteClonePathsAction({
            context: context,
            shouldSkipPrompts: false,
        });

        expect(text).toHaveBeenCalledTimes(1);

        const saved = AgentsFile.parse(
            await readFile(AgentsFile.path(context), "utf8"),
        );

        expect(saved?.remoteClonePaths).toEqual({
            saved: "/already",
            unsaved: expect.stringContaining("picked"),
        });
    });

    it("never prompts or saves when prompts are skipped", async () => {
        vi.spyOn(input, "isInteractive").mockReturnValue(true);
        const text = vi.spyOn(input, "text");

        await ensureRemoteClonePathsAction({
            context: context,
            shouldSkipPrompts: true,
        });

        expect(text).not.toHaveBeenCalled();

        const saved = AgentsFile.parse(
            await readFile(AgentsFile.path(context), "utf8"),
        );

        expect(saved?.clonePathOf("unsaved")).toBeUndefined();
    });
});
