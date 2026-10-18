import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import loadCopiedFilesFileAction from "@artifacts/actions/load-copied-files-file-action.js";
import saveCopiedFilesFileAction from "@artifacts/actions/save-copied-files-file-action.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import type { RunContext } from "@shared/types/run-context.js";

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-load-copied-files-"));
    context = { cwd: cwd, sourceDir: ".ai" };
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("loadCopiedFilesFileAction", () => {
    it("returns an empty record when nothing was saved yet", async () => {
        const file = await loadCopiedFilesFileAction({ context: context });

        expect(file.pathsFor(AgentCapability.Skills)).toEqual([]);
    });

    it("reads back a previously saved record", async () => {
        await saveCopiedFilesFileAction({
            capability: AgentCapability.Skills,
            context: context,
            copiedFilePaths: [".test/skills/a/SKILL.md"],
            mirroredFilePaths: [".test/skills/a/SKILL.md"],
        });

        const file = await loadCopiedFilesFileAction({ context: context });

        expect(file.pathsFor(AgentCapability.Skills)).toEqual([
            ".test/skills/a/SKILL.md",
        ]);
    });
});
