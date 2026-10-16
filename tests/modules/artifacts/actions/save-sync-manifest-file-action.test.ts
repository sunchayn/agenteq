import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import saveSyncManifestFileAction from "@artifacts/actions/save-sync-manifest-file-action.js";
import loadSyncManifestFileAction from "@artifacts/actions/load-sync-manifest-file-action.js";
import SyncManifestFile from "@artifacts/entities/sync-manifest-file.js";
import { hashContent } from "@support/utils/hash-content.js";
import type { RunContext } from "@shared/types/run-context.js";

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-save-sync-manifest-"));
    context = { cwd: cwd, sourceDir: ".ai" };
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("saveSyncManifestFileAction", () => {
    it("saves the hash of every given artifact path", async () => {
        await writeFile(join(cwd, "CLAUDE.md"), "hello");
        await writeFile(join(cwd, ".mcp.json"), "{}");

        await saveSyncManifestFileAction({
            artifactPaths: ["CLAUDE.md", ".mcp.json"],
            context: context,
        });

        const manifest = await loadSyncManifestFileAction({
            context: context,
        });

        expect(manifest.hashFor("CLAUDE.md")).toBe(hashContent("hello"));
        expect(manifest.hashFor(".mcp.json")).toBe(hashContent("{}"));
    });

    it("keeps a previously saved hash for a path this run did not touch", async () => {
        await writeFile(join(cwd, "CLAUDE.md"), "hello");

        await saveSyncManifestFileAction({
            artifactPaths: ["CLAUDE.md"],
            context: context,
        });

        await writeFile(join(cwd, ".mcp.json"), "{}");

        await saveSyncManifestFileAction({
            artifactPaths: [".mcp.json"],
            context: context,
        });

        const manifest = await loadSyncManifestFileAction({
            context: context,
        });

        expect(manifest.hashFor("CLAUDE.md")).toBe(hashContent("hello"));
        expect(manifest.hashFor(".mcp.json")).toBe(hashContent("{}"));
    });

    it("skips a path that resolves to a directory", async () => {
        await mkdir(join(cwd, ".test/commands"), { recursive: true });

        await saveSyncManifestFileAction({
            artifactPaths: [".test/commands"],
            context: context,
        });

        const manifest = await loadSyncManifestFileAction({
            context: context,
        });

        expect(manifest.hashFor(".test/commands")).toBeUndefined();
    });

    it("gitignores the manifest file the first time it is created", async () => {
        await writeFile(join(cwd, "CLAUDE.md"), "hello");

        await saveSyncManifestFileAction({
            artifactPaths: ["CLAUDE.md"],
            context: context,
        });

        expect(await readFile(join(cwd, ".gitignore"), "utf8")).toContain(
            "sync-manifest.json",
        );
    });

    it("never re-adds the manifest to .gitignore once it already exists", async () => {
        await writeFile(join(cwd, "CLAUDE.md"), "hello");

        await saveSyncManifestFileAction({
            artifactPaths: ["CLAUDE.md"],
            context: context,
        });

        await saveSyncManifestFileAction({
            artifactPaths: ["CLAUDE.md"],
            context: context,
        });

        const gitignore = await readFile(join(cwd, ".gitignore"), "utf8");

        const occurrences = gitignore
            .split("\n")
            .filter(
                (line) =>
                    line === "agenteq-sync-manifest.json" ||
                    line.endsWith("/agenteq-sync-manifest.json"),
            );

        expect(occurrences).toHaveLength(1);
    });
});

describe("SyncManifestFile.path matches where saveSyncManifestFileAction writes", () => {
    it("writes under <source-dir>/agenteq-sync-manifest.json", async () => {
        await writeFile(join(cwd, "CLAUDE.md"), "hello");

        await saveSyncManifestFileAction({
            artifactPaths: ["CLAUDE.md"],
            context: context,
        });

        expect(
            await readFile(SyncManifestFile.path(context), "utf8"),
        ).toContain("CLAUDE.md");
    });
});
