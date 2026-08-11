import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import loadAgentsFileAction from "@agents/actions/load-agents-file-action.js";
import AgentsFile from "@agents/entities/agents-file.js";
import type { RunContext } from "@shared/types/run-context.js";

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-load-agents-file-"));
    context = { cwd: cwd, sourceDir: ".ai" };
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("loadAgentsFileAction", () => {
    it("returns undefined when no agents file exists", async () => {
        expect(
            await loadAgentsFileAction({ context: context }),
        ).toBeUndefined();
    });

    it("returns undefined for a malformed agents file", async () => {
        await mkdir(dirname(AgentsFile.path(context)), { recursive: true });
        await writeFile(AgentsFile.path(context), "not json", "utf8");

        expect(
            await loadAgentsFileAction({ context: context }),
        ).toBeUndefined();
    });

    it("returns a parsed AgentsFile for a valid agents file", async () => {
        await mkdir(dirname(AgentsFile.path(context)), { recursive: true });
        await writeFile(
            AgentsFile.path(context),
            '{"agents":["claude_code"]}',
            "utf8",
        );

        const result = await loadAgentsFileAction({ context: context });

        expect(result?.agentNames).toEqual(["claude_code"]);
    });
});
