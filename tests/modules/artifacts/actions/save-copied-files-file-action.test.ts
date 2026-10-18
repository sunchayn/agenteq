import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import saveCopiedFilesFileAction from "@artifacts/actions/save-copied-files-file-action.js";
import loadCopiedFilesFileAction from "@artifacts/actions/load-copied-files-file-action.js";
import filesystem from "@infrastructure/filesystem.js";
import CopiedFilesFile from "@artifacts/entities/copied-files-file.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import type { RunContext } from "@shared/types/run-context.js";

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-save-copied-files-"));
    context = { cwd: cwd, sourceDir: ".ai" };
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("saveCopiedFilesFileAction", () => {
    it("saves the given copied file paths under their capability", async () => {
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

    it("removes a previously copied file that this run did not mirror at all", async () => {
        await mkdir(join(cwd, ".test/skills/a"), { recursive: true });
        await writeFile(join(cwd, ".test/skills/a/SKILL.md"), "hello");

        await saveCopiedFilesFileAction({
            capability: AgentCapability.Skills,
            context: context,
            copiedFilePaths: [".test/skills/a/SKILL.md"],
            mirroredFilePaths: [".test/skills/a/SKILL.md"],
        });

        await saveCopiedFilesFileAction({
            capability: AgentCapability.Skills,
            context: context,
            copiedFilePaths: [],
            mirroredFilePaths: [],
        });

        expect(
            await filesystem.exists(join(cwd, ".test/skills/a/SKILL.md")),
        ).toBe(false);
    });

    it("leaves a path this run mirrors as a symlink instead of a copy", async () => {
        await mkdir(join(cwd, ".test/skills/a"), { recursive: true });
        await writeFile(join(cwd, ".test/skills/a/SKILL.md"), "hello");

        await saveCopiedFilesFileAction({
            capability: AgentCapability.Skills,
            context: context,
            copiedFilePaths: [".test/skills/a/SKILL.md"],
            mirroredFilePaths: [".test/skills/a/SKILL.md"],
        });

        // The stage already rewrote the path as a symlink once copy mode turned off,
        // so it stops being reported as copied, but it is still mirrored.
        await saveCopiedFilesFileAction({
            capability: AgentCapability.Skills,
            context: context,
            copiedFilePaths: [],
            mirroredFilePaths: [".test/skills/a/SKILL.md"],
        });

        expect(
            await readFile(join(cwd, ".test/skills/a/SKILL.md"), "utf8"),
        ).toBe("hello");
    });

    it("never touches a path it never copied", async () => {
        await writeFile(join(cwd, "hand-made.md"), "mine");

        await saveCopiedFilesFileAction({
            capability: AgentCapability.Skills,
            context: context,
            copiedFilePaths: [],
            mirroredFilePaths: [],
        });

        expect(await filesystem.exists(join(cwd, "hand-made.md"))).toBe(true);
    });

    it("never reconciles a capability this run did not sync", async () => {
        await mkdir(join(cwd, ".test/skills/a"), { recursive: true });
        await writeFile(join(cwd, ".test/skills/a/SKILL.md"), "hello");

        await saveCopiedFilesFileAction({
            capability: AgentCapability.Skills,
            context: context,
            copiedFilePaths: [".test/skills/a/SKILL.md"],
            mirroredFilePaths: [".test/skills/a/SKILL.md"],
        });

        // A later sync reconciling an unrelated capability, e.g. `--only mcp`,
        // must leave every path recorded for skills exactly as it was.
        await saveCopiedFilesFileAction({
            capability: AgentCapability.Mcp,
            context: context,
            copiedFilePaths: [],
            mirroredFilePaths: [],
        });

        expect(
            await filesystem.exists(join(cwd, ".test/skills/a/SKILL.md")),
        ).toBe(true);

        const file = await loadCopiedFilesFileAction({ context: context });

        expect(file.pathsFor(AgentCapability.Skills)).toEqual([
            ".test/skills/a/SKILL.md",
        ]);
    });

    it("gitignores the copied files record the first time it is created", async () => {
        await saveCopiedFilesFileAction({
            capability: AgentCapability.Skills,
            context: context,
            copiedFilePaths: [".test/skills/a/SKILL.md"],
            mirroredFilePaths: [".test/skills/a/SKILL.md"],
        });

        expect(await readFile(join(cwd, ".gitignore"), "utf8")).toContain(
            "agenteq-copied-files.json",
        );
    });

    it("never creates the record when nothing was ever or is now copied", async () => {
        await saveCopiedFilesFileAction({
            capability: AgentCapability.Skills,
            context: context,
            copiedFilePaths: [],
            mirroredFilePaths: [],
        });

        expect(await filesystem.exists(CopiedFilesFile.path(context))).toBe(
            false,
        );
    });
});

describe("CopiedFilesFile.path matches where saveCopiedFilesFileAction writes", () => {
    it("writes under <source-dir>/agenteq-copied-files.json", async () => {
        await saveCopiedFilesFileAction({
            capability: AgentCapability.Skills,
            context: context,
            copiedFilePaths: [".test/skills/a/SKILL.md"],
            mirroredFilePaths: [".test/skills/a/SKILL.md"],
        });

        expect(await readFile(CopiedFilesFile.path(context), "utf8")).toContain(
            ".test/skills/a/SKILL.md",
        );
    });
});
