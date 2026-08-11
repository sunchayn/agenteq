import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import filesystem from "@infrastructure/filesystem.js";

let cwd: string;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-filesystem-service-"));
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("filesystem.readFile", () => {
    it("returns the file's content when it exists", async () => {
        await writeFile(join(cwd, "a.txt"), "hello");
        expect(await filesystem.readFile(join(cwd, "a.txt"))).toBe("hello");
    });

    it("returns undefined when the file doesn't exist", async () => {
        expect(
            await filesystem.readFile(join(cwd, "missing.txt")),
        ).toBeUndefined();
    });
});

describe("filesystem.writeFile", () => {
    it("writes the given content to disk", async () => {
        await filesystem.writeFile({
            content: "hello",
            path: join(cwd, "a.txt"),
        });

        expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("hello");
    });
});

describe("filesystem.exists", () => {
    it("is true for an existing path", async () => {
        await writeFile(join(cwd, "a.txt"), "hello");
        expect(await filesystem.exists(join(cwd, "a.txt"))).toBe(true);
    });

    it("is false for a missing path", async () => {
        expect(await filesystem.exists(join(cwd, "missing.txt"))).toBe(false);
    });
});

describe("filesystem.glob", () => {
    it("lists files matching the pattern", async () => {
        await writeFile(join(cwd, "a.md"), "a");
        await writeFile(join(cwd, "b.md"), "b");
        const files = await filesystem.glob({ cwd: cwd, pattern: "*.md" });

        expect(files.sort()).toEqual(["a.md", "b.md"]);
    });
});

describe("filesystem.symlinkOrCopy", () => {
    it("symlinks the source into the target", async () => {
        await writeFile(join(cwd, "source.txt"), "hello");
        const target = join(cwd, "target.txt");

        await filesystem.symlinkOrCopy({
            source: join(cwd, "source.txt"),
            target: target,
        });

        expect((await lstat(target)).isSymbolicLink()).toBe(true);
        expect(await readFile(target, "utf8")).toBe("hello");
    });
});

describe("filesystem.mkdir", () => {
    it("creates nested directories", async () => {
        await filesystem.mkdir(join(cwd, "a", "b", "c"));
        expect(await filesystem.exists(join(cwd, "a", "b", "c"))).toBe(true);
    });
});

describe("filesystem.remove", () => {
    it("removes a directory and its contents", async () => {
        await filesystem.mkdir(join(cwd, "a"));
        await writeFile(join(cwd, "a", "file.txt"), "hello");
        await filesystem.remove(join(cwd, "a"));
        expect(await filesystem.exists(join(cwd, "a"))).toBe(false);
    });

    it("does not throw when the path doesn't exist", async () => {
        await expect(
            filesystem.remove(join(cwd, "missing")),
        ).resolves.toBeUndefined();
    });
});

describe("filesystem.removeSymlinksInto", () => {
    it("removes a symlink that resolves inside sourceDir", async () => {
        const sourceDir = join(cwd, "source");
        const targetDir = join(cwd, "target");

        await mkdir(sourceDir, { recursive: true });
        await mkdir(targetDir, { recursive: true });
        await writeFile(join(sourceDir, "a.md"), "hello");
        await symlink(join(sourceDir, "a.md"), join(targetDir, "a.md"));

        await filesystem.removeSymlinksInto({
            sourceDir: sourceDir,
            targetDir: targetDir,
        });

        expect(await filesystem.exists(join(targetDir, "a.md"))).toBe(false);
    });

    it("leaves a real file in targetDir untouched", async () => {
        const sourceDir = join(cwd, "source");
        const targetDir = join(cwd, "target");

        await mkdir(sourceDir, { recursive: true });
        await mkdir(targetDir, { recursive: true });
        await writeFile(join(targetDir, "stale.md"), "kept as-is");

        await filesystem.removeSymlinksInto({
            sourceDir: sourceDir,
            targetDir: targetDir,
        });

        expect(await readFile(join(targetDir, "stale.md"), "utf8")).toBe(
            "kept as-is",
        );
    });

    it("leaves a symlink that resolves outside sourceDir untouched", async () => {
        const sourceDir = join(cwd, "source");
        const targetDir = join(cwd, "target");
        const elsewhere = join(cwd, "elsewhere");

        await mkdir(sourceDir, { recursive: true });
        await mkdir(targetDir, { recursive: true });
        await writeFile(join(cwd, "elsewhere.md"), "hello");
        await symlink(join(cwd, "elsewhere.md"), elsewhere);
        await symlink(elsewhere, join(targetDir, "linked.md"));

        await filesystem.removeSymlinksInto({
            sourceDir: sourceDir,
            targetDir: targetDir,
        });

        expect(
            (await lstat(join(targetDir, "linked.md"))).isSymbolicLink(),
        ).toBe(true);
    });

    it("does not throw when targetDir doesn't exist", async () => {
        await expect(
            filesystem.removeSymlinksInto({
                sourceDir: join(cwd, "source"),
                targetDir: join(cwd, "missing"),
            }),
        ).resolves.toBeUndefined();
    });
});
