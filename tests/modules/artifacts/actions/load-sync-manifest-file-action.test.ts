import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import loadSyncManifestFileAction from "@artifacts/actions/load-sync-manifest-file-action.js";
import saveSyncManifestFileAction from "@artifacts/actions/save-sync-manifest-file-action.js";
import saveCopiedFilesFileAction from "@artifacts/actions/save-copied-files-file-action.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import type { RunContext } from "@shared/types/run-context.js";

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-load-sync-manifest-"));
    context = { cwd: cwd, sourceDir: ".ai" };
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("loadSyncManifestFileAction", () => {
    it("returns an empty manifest when nothing was saved yet", async () => {
        const manifest = await loadSyncManifestFileAction({
            context: context,
        });

        expect(manifest.hashesByPath).toEqual({});
    });

    it("reads back a previously saved manifest", async () => {
        await writeFile(join(cwd, "CLAUDE.md"), "hello");

        await saveSyncManifestFileAction({
            artifactPaths: ["CLAUDE.md"],
            context: context,
        });

        const manifest = await loadSyncManifestFileAction({
            context: context,
        });

        expect(manifest.hashFor("CLAUDE.md")).toBeDefined();
    });

    it("reads back a previously saved capability's copied paths", async () => {
        await saveCopiedFilesFileAction({
            capability: AgentCapability.Skills,
            context: context,
            copiedFilePaths: [".test/skills/a/SKILL.md"],
            mirroredFilePaths: [".test/skills/a/SKILL.md"],
        });

        const manifest = await loadSyncManifestFileAction({
            context: context,
        });

        expect(manifest.pathsFor(AgentCapability.Skills)).toEqual([
            ".test/skills/a/SKILL.md",
        ]);
    });
});
