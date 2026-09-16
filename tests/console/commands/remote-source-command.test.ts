import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import git from "@infrastructure/git.js";
import RemoteSourcesFile from "@artifacts/entities/remote-sources-file.js";
import type { RunContext } from "@shared/types/run-context.js";

const { registerRemoteSourceCommand } =
    await import("@console/commands/remote-source.js");

function program(): Command {
    const cmd = new Command();

    cmd.exitOverride();
    registerRemoteSourceCommand(cmd);

    return cmd;
}

function runGit(dir: string, args: string[]): void {
    spawnSync("git", args, { cwd: dir });
}

async function createOrigin(): Promise<string> {
    const originDir = await mkdtemp(join(tmpdir(), "agenteq-remote-origin-"));

    runGit(originDir, ["init", "--quiet"]);
    runGit(originDir, ["config", "user.email", "test@example.com"]);
    runGit(originDir, ["config", "user.name", "Test"]);

    return originDir;
}

async function commit(
    dir: string,
    relPath: string,
    content: string,
): Promise<void> {
    await writeFile(join(dir, relPath), content, "utf8");
    runGit(dir, ["add", relPath]);
    runGit(dir, ["commit", "--quiet", "-m", "commit"]);
}

async function readSavedFile(): Promise<RemoteSourcesFile> {
    const raw = await readFile(RemoteSourcesFile.path(context), "utf8");

    return RemoteSourcesFile.parse(raw);
}

let cwd: string;
let context: RunContext;
let cwdSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-remote-source-cmd-"));
    context = { cwd: cwd, sourceDir: ".ai" };
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(cwd);
});

afterEach(async () => {
    cwdSpy.mockRestore();
    await rm(cwd, { force: true, recursive: true });
});

describe("agenteq remote-source add (interactive picker)", () => {
    it("saves only the items picked in the multiselect prompts", async () => {
        vi.resetModules();

        const isTTYMock = vi.fn().mockReturnValue(true);
        const isCIMock = vi.fn().mockReturnValue(false);
        const multiselectMock = vi.fn().mockResolvedValue(["writing-tests"]);
        const confirmMock = vi.fn().mockResolvedValue(false);
        const isCancelMock = vi.fn().mockReturnValue(false);

        vi.doMock("@clack/prompts", async (importOriginal) => {
            const actual =
                await importOriginal<typeof import("@clack/prompts")>();

            return {
                ...actual,
                confirm: confirmMock,
                isCancel: isCancelMock,
                isCI: isCIMock,
                isTTY: isTTYMock,
                multiselect: multiselectMock,
            };
        });

        const { registerRemoteSourceCommand: registerInteractive } =
            await import("@console/commands/remote-source.js");

        const originDir = await createOrigin();

        await commit(originDir, "GUIDELINES.md", "# Shared\n");

        const skillDir = join(originDir, "skills/writing-tests");

        await mkdir(skillDir, { recursive: true });
        await writeFile(join(skillDir, "SKILL.md"), "hello", "utf8");

        runGit(originDir, ["add", "skills"]);
        runGit(originDir, ["commit", "--quiet", "-m", "add skill"]);

        const cmd = new Command();

        cmd.exitOverride();
        registerInteractive(cmd);

        await cmd.parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "team",
            originDir,
            "--path",
            join(cwd, "clone"),
        ]);

        const saved = await readSavedFile();

        expect(saved.get("team")?.selection.skills).toEqual(["writing-tests"]);
        expect(saved.get("team")?.selection.guidelines).toBe(false);

        vi.doUnmock("@clack/prompts");
        await rm(originDir, { force: true, recursive: true });
    });
});

describe("agenteq remote-source add", () => {
    let originDir: string;

    beforeEach(async () => {
        originDir = await createOrigin();
        await commit(originDir, "GUIDELINES.md", "# Shared\n");
    });

    afterEach(async () => {
        await rm(originDir, { force: true, recursive: true });
    });

    it("clones the source and saves everything found when run non-interactively", async () => {
        const clonePath = join(cwd, "clone");

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "team",
            originDir,
            "--yes",
            "--path",
            clonePath,
        ]);

        const saved = await readSavedFile();
        const entry = saved.get("team");

        expect(entry?.url).toBe(originDir);
        expect(entry?.clonePath).toBe(clonePath);
        expect(entry?.selection.guidelines).toBe(true);

        expect(await readFile(join(clonePath, "GUIDELINES.md"), "utf8")).toBe(
            "# Shared\n",
        );
    });

    it("does not gitignore the saved file by default", async () => {
        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "team",
            originDir,
            "--yes",
            "--path",
            join(cwd, "clone"),
        ]);

        await expect(
            readFile(join(cwd, ".gitignore"), "utf8"),
        ).rejects.toThrow();
    });

    it("gitignores the saved file when --ignored is passed", async () => {
        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "team",
            originDir,
            "--yes",
            "--ignored",
            "--path",
            join(cwd, "clone"),
        ]);

        const gitignore = await readFile(join(cwd, ".gitignore"), "utf8");

        expect(gitignore).toContain(".ai/remote-sources.json");
    });

    it("throws a trackable CliError when the clone has none of the expected layout", async () => {
        const emptyOrigin = await createOrigin();

        await commit(emptyOrigin, "README.md", "nothing agenteq-shaped here");

        await expect(
            program().parseAsync([
                "node",
                "agenteq",
                "remote-source",
                "add",
                "team",
                emptyOrigin,
                "--yes",
                "--path",
                join(cwd, "clone"),
            ]),
        ).rejects.toMatchObject({ code: "E_INVALID_REMOTE_SOURCE" });

        await rm(emptyOrigin, { force: true, recursive: true });
    });

    it("throws a trackable CliError when the clone url is unreachable", async () => {
        await expect(
            program().parseAsync([
                "node",
                "agenteq",
                "remote-source",
                "add",
                "team",
                join(tmpdir(), "agenteq-does-not-exist"),
                "--yes",
                "--path",
                join(cwd, "clone"),
            ]),
        ).rejects.toMatchObject({ code: "E_REMOTE_SOURCE_CLONE_FAILED" });
    });

    it("throws a trackable CliError when the name is already configured", async () => {
        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "team",
            originDir,
            "--yes",
            "--path",
            join(cwd, "clone"),
        ]);

        await expect(
            program().parseAsync([
                "node",
                "agenteq",
                "remote-source",
                "add",
                "team",
                originDir,
                "--yes",
                "--path",
                join(cwd, "other-clone"),
            ]),
        ).rejects.toMatchObject({ code: "E_REMOTE_SOURCE_ALREADY_EXISTS" });
    });

    it("throws a trackable CliError when the url is already configured under another name", async () => {
        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "team",
            originDir,
            "--yes",
            "--path",
            join(cwd, "clone"),
        ]);

        await expect(
            program().parseAsync([
                "node",
                "agenteq",
                "remote-source",
                "add",
                "other",
                originDir,
                "--yes",
                "--path",
                join(cwd, "other-clone"),
            ]),
        ).rejects.toMatchObject({ code: "E_REMOTE_SOURCE_URL_ALREADY_EXISTS" });
    });

    it("keeps a previously added remote when adding a second one", async () => {
        const otherOrigin = await createOrigin();

        await commit(otherOrigin, "GUIDELINES.md", "# Other\n");

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "team",
            originDir,
            "--yes",
            "--path",
            join(cwd, "clone"),
        ]);

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "other",
            otherOrigin,
            "--yes",
            "--path",
            join(cwd, "other-clone"),
        ]);

        const saved = await readSavedFile();

        expect(saved.names()).toEqual(["team", "other"]);

        await rm(otherOrigin, { force: true, recursive: true });
    });

    it("reuses an existing clone whose origin already matches instead of re-cloning", async () => {
        const clonePath = join(cwd, "clone");

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "team",
            originDir,
            "--yes",
            "--path",
            clonePath,
        ]);

        await commit(originDir, "second.md", "more");

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "remove",
            "team",
        ]);

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "team",
            originDir,
            "--yes",
            "--path",
            clonePath,
        ]);

        expect(git.remoteUrl({ cwd: clonePath })).toBe(originDir);
    });

    it("throws a trackable CliError when the path already holds an unrelated clone", async () => {
        const otherOrigin = await createOrigin();

        await commit(otherOrigin, "GUIDELINES.md", "unrelated");

        const clonePath = join(cwd, "clone");

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "other",
            otherOrigin,
            "--yes",
            "--path",
            clonePath,
        ]);

        await expect(
            program().parseAsync([
                "node",
                "agenteq",
                "remote-source",
                "add",
                "team",
                originDir,
                "--yes",
                "--path",
                clonePath,
            ]),
        ).rejects.toMatchObject({ code: "E_REMOTE_SOURCE_PATH_CONFLICT" });

        await rm(otherOrigin, { force: true, recursive: true });
    });
});

describe("agenteq remote-source list", () => {
    it("reports that nothing is configured", async () => {
        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "list",
            "--json",
        ]);

        const payload = JSON.parse(
            writeSpy.mock.calls.map(([chunk]) => String(chunk)).join(""),
        ) as { message: string };

        expect(payload.message).toContain("No remote sources");

        writeSpy.mockRestore();
    });

    it("lists every configured remote as JSON", async () => {
        const originDir = await createOrigin();

        await commit(originDir, "GUIDELINES.md", "# Shared\n");

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "team",
            originDir,
            "--yes",
            "--path",
            join(cwd, "clone"),
        ]);

        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "list",
            "--json",
        ]);

        const payload = JSON.parse(
            writeSpy.mock.calls.map(([chunk]) => String(chunk)).join(""),
        ) as Record<string, { url: string }>;

        expect(Object.keys(payload)).toEqual(["team"]);
        expect(payload.team.url).toBe(originDir);

        writeSpy.mockRestore();
        await rm(originDir, { force: true, recursive: true });
    });
});

describe("agenteq remote-source update-choices", () => {
    it("throws a trackable CliError when the named remote isn't configured yet", async () => {
        await expect(
            program().parseAsync([
                "node",
                "agenteq",
                "remote-source",
                "update-choices",
                "team",
                "--json",
            ]),
        ).rejects.toMatchObject({ code: "E_REMOTE_SOURCE_NOT_CONFIGURED" });
    });

    it("throws a trackable CliError when run non-interactively", async () => {
        const originDir = await createOrigin();

        await commit(originDir, "GUIDELINES.md", "# Shared\n");

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "team",
            originDir,
            "--yes",
            "--path",
            join(cwd, "clone"),
        ]);

        await expect(
            program().parseAsync([
                "node",
                "agenteq",
                "remote-source",
                "update-choices",
                "team",
                "--json",
            ]),
        ).rejects.toMatchObject({ code: "E_REMOTE_SOURCE_NEEDS_PROMPT" });

        await rm(originDir, { force: true, recursive: true });
    });
});

describe("agenteq remote-source remove", () => {
    it("prints a notice and does nothing when the named remote isn't configured", async () => {
        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "remove",
            "team",
            "--json",
        ]);

        const payload = JSON.parse(
            writeSpy.mock.calls.map(([chunk]) => String(chunk)).join(""),
        ) as { message: string };

        expect(payload.message).toContain("Nothing to remove");

        writeSpy.mockRestore();
    });

    it("deletes the file once the only configured remote is removed, leaving the clone in place", async () => {
        const originDir = await createOrigin();

        await commit(originDir, "GUIDELINES.md", "# Shared\n");

        const clonePath = join(cwd, "clone");

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "team",
            originDir,
            "--yes",
            "--path",
            clonePath,
        ]);

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "remove",
            "team",
        ]);

        await expect(
            readFile(RemoteSourcesFile.path(context), "utf8"),
        ).rejects.toThrow();

        expect(await readFile(join(clonePath, "GUIDELINES.md"), "utf8")).toBe(
            "# Shared\n",
        );

        await rm(originDir, { force: true, recursive: true });
    });

    it("keeps the other configured remotes when only one is removed", async () => {
        const originDir = await createOrigin();
        const otherOrigin = await createOrigin();

        await commit(originDir, "GUIDELINES.md", "# Shared\n");
        await commit(otherOrigin, "GUIDELINES.md", "# Other\n");

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "team",
            originDir,
            "--yes",
            "--path",
            join(cwd, "clone"),
        ]);

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "other",
            otherOrigin,
            "--yes",
            "--path",
            join(cwd, "other-clone"),
        ]);

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "remove",
            "team",
        ]);

        const saved = await readSavedFile();

        expect(saved.names()).toEqual(["other"]);

        await rm(originDir, { force: true, recursive: true });
        await rm(otherOrigin, { force: true, recursive: true });
    });
});
