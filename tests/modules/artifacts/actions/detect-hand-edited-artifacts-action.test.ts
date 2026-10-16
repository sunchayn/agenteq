import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import detectHandEditedArtifactsAction from "@artifacts/actions/detect-hand-edited-artifacts-action.js";
import saveSyncManifestFileAction from "@artifacts/actions/save-sync-manifest-file-action.js";
import type { RunContext } from "@shared/types/run-context.js";

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-detect-hand-edited-"));
    context = { cwd: cwd, sourceDir: ".ai" };
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("detectHandEditedArtifactsAction", () => {
    it("reports nothing when no manifest was ever saved", async () => {
        await writeFile(join(cwd, "CLAUDE.md"), "hello");

        expect(
            await detectHandEditedArtifactsAction({ context: context }),
        ).toEqual([]);
    });

    it("reports nothing when the file still matches its saved hash", async () => {
        await writeFile(join(cwd, "CLAUDE.md"), "hello");

        await saveSyncManifestFileAction({
            artifactPaths: ["CLAUDE.md"],
            context: context,
        });

        expect(
            await detectHandEditedArtifactsAction({ context: context }),
        ).toEqual([]);
    });

    it("reports a file whose content changed since the last sync", async () => {
        await writeFile(join(cwd, "CLAUDE.md"), "hello");

        await saveSyncManifestFileAction({
            artifactPaths: ["CLAUDE.md"],
            context: context,
        });

        await writeFile(join(cwd, "CLAUDE.md"), "hand-edited content");

        expect(
            await detectHandEditedArtifactsAction({ context: context }),
        ).toEqual(["CLAUDE.md"]);
    });

    it("reports nothing for a file that was deleted since the last sync", async () => {
        await writeFile(join(cwd, "CLAUDE.md"), "hello");

        await saveSyncManifestFileAction({
            artifactPaths: ["CLAUDE.md"],
            context: context,
        });

        await rm(join(cwd, "CLAUDE.md"));

        expect(
            await detectHandEditedArtifactsAction({ context: context }),
        ).toEqual([]);
    });
});
