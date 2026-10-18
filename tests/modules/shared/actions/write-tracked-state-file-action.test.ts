import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import writeTrackedStateFileAction from "@shared/actions/write-tracked-state-file-action.js";
import type { RunContext } from "@shared/types/run-context.js";

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-write-tracked-state-file-"));
    context = { cwd: cwd, sourceDir: ".ai" };

    spawnSync("git", ["init", "--quiet"], { cwd: cwd });
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

function isIgnored(relPath: string): boolean {
    return (
        spawnSync("git", ["check-ignore", "--quiet", "--", relPath], {
            cwd: cwd,
        }).status === 0
    );
}

describe("writeTrackedStateFileAction", () => {
    it("writes the given content, creating the parent directory", async () => {
        const path = join(cwd, ".ai/example.json");

        await writeTrackedStateFileAction({
            content: "hello",
            context: context,
            path: path,
        });

        expect(await readFile(path, "utf8")).toBe("hello");
    });

    it("gitignores the path the first time it is created", async () => {
        const path = join(cwd, ".ai/example.json");

        await writeTrackedStateFileAction({
            content: "hello",
            context: context,
            path: path,
        });

        expect(isIgnored(".ai/example.json")).toBe(true);
    });

    it("does not re-ignore a path already ignored on a later write", async () => {
        const path = join(cwd, ".ai/example.json");

        await writeTrackedStateFileAction({
            content: "first",
            context: context,
            path: path,
        });

        spawnSync("git", ["add", ".gitignore"], { cwd: cwd });

        await writeTrackedStateFileAction({
            content: "second",
            context: context,
            path: path,
        });

        const gitignore = await readFile(join(cwd, ".gitignore"), "utf8");

        expect(gitignore.match(/example\.json/g)).toHaveLength(1);
    });

    it("never gitignores the path when shouldIgnore is false", async () => {
        const path = join(cwd, ".ai/example.json");

        await writeTrackedStateFileAction({
            content: "hello",
            context: context,
            path: path,
            shouldIgnore: false,
        });

        expect(isIgnored(".ai/example.json")).toBe(false);
    });
});
