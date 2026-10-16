import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import git from "@infrastructure/git.js";
import AgentsFile from "@agents/entities/agents-file.js";
import RemoteSourcesFile from "@artifacts/entities/remote-sources-file.js";
import saveRemoteSourcesFileAction from "@artifacts/actions/save-remote-sources-file-action.js";
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

        const groupMultiselectMock = vi
            .fn()
            .mockResolvedValue(["writing-tests"]);

        const confirmMock = vi.fn().mockResolvedValue(false);
        const isCancelMock = vi.fn().mockReturnValue(false);

        vi.doMock("@clack/prompts", async (importOriginal) => {
            const actual =
                await importOriginal<typeof import("@clack/prompts")>();

            return {
                ...actual,
                confirm: confirmMock,
                groupMultiselect: groupMultiselectMock,
                isCancel: isCancelMock,
                isCI: isCIMock,
                isTTY: isTTYMock,
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

    it("groups a namespaced skill under its own group, alongside a root group", async () => {
        vi.resetModules();

        const isTTYMock = vi.fn().mockReturnValue(true);
        const isCIMock = vi.fn().mockReturnValue(false);

        const groupMultiselectMock = vi
            .fn()
            .mockResolvedValue(["backend::backend-example"]);

        const confirmMock = vi.fn().mockResolvedValue(false);
        const isCancelMock = vi.fn().mockReturnValue(false);

        vi.doMock("@clack/prompts", async (importOriginal) => {
            const actual =
                await importOriginal<typeof import("@clack/prompts")>();

            return {
                ...actual,
                confirm: confirmMock,
                groupMultiselect: groupMultiselectMock,
                isCancel: isCancelMock,
                isCI: isCIMock,
                isTTY: isTTYMock,
            };
        });

        const { registerRemoteSourceCommand: registerInteractive } =
            await import("@console/commands/remote-source.js");

        const originDir = await createOrigin();

        await commit(originDir, "GUIDELINES.md", "# Shared\n");

        const rootSkillDir = join(originDir, "skills/writing-tests");

        const nestedSkillDir = join(
            originDir,
            "backend/skills/backend-example",
        );

        await mkdir(rootSkillDir, { recursive: true });
        await writeFile(join(rootSkillDir, "SKILL.md"), "hello", "utf8");

        await mkdir(nestedSkillDir, { recursive: true });
        await writeFile(join(nestedSkillDir, "SKILL.md"), "hello", "utf8");

        runGit(originDir, ["add", "skills", "backend"]);
        runGit(originDir, ["commit", "--quiet", "-m", "add skills"]);

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

        const [{ options }] = groupMultiselectMock.mock.calls[0];

        expect(options).toEqual({
            "(root)": [{ label: "writing-tests", value: "writing-tests" }],
            backend: [
                {
                    label: "backend-example",
                    value: "backend::backend-example",
                },
            ],
        });

        const saved = await readSavedFile();

        expect(saved.get("team")?.selection.skills).toEqual([
            "backend::backend-example",
        ]);

        vi.doUnmock("@clack/prompts");
        await rm(originDir, { force: true, recursive: true });
    });

    it("groups an mcp server under the namespace it was found under", async () => {
        vi.resetModules();

        const isTTYMock = vi.fn().mockReturnValue(true);
        const isCIMock = vi.fn().mockReturnValue(false);

        const groupMultiselectMock = vi
            .fn()
            .mockResolvedValue(["backend::backend-shared-server"]);

        const confirmMock = vi.fn().mockResolvedValue(false);
        const isCancelMock = vi.fn().mockReturnValue(false);

        vi.doMock("@clack/prompts", async (importOriginal) => {
            const actual =
                await importOriginal<typeof import("@clack/prompts")>();

            return {
                ...actual,
                confirm: confirmMock,
                groupMultiselect: groupMultiselectMock,
                isCancel: isCancelMock,
                isCI: isCIMock,
                isTTY: isTTYMock,
            };
        });

        const { registerRemoteSourceCommand: registerInteractive } =
            await import("@console/commands/remote-source.js");

        const originDir = await createOrigin();

        await commit(originDir, "GUIDELINES.md", "# Shared\n");

        const rootMcpDir = join(originDir, "mcp/root-server");

        const nestedMcpDir = join(
            originDir,
            "backend/mcp/backend-shared-server",
        );

        await mkdir(rootMcpDir, { recursive: true });
        await writeFile(
            join(rootMcpDir, "config.json"),
            JSON.stringify({
                config: { command: "npx" },
                type: "stdio",
            }),
            "utf8",
        );

        await mkdir(nestedMcpDir, { recursive: true });
        await writeFile(
            join(nestedMcpDir, "config.json"),
            JSON.stringify({
                config: { command: "npx" },
                type: "stdio",
            }),
            "utf8",
        );

        runGit(originDir, ["add", "mcp", "backend"]);
        runGit(originDir, ["commit", "--quiet", "-m", "add mcp servers"]);

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

        const mcpCall = groupMultiselectMock.mock.calls.find(([params]) =>
            String(params.message).includes("MCP servers"),
        );

        expect(mcpCall?.[0].options).toEqual({
            "(root)": [{ label: "root-server", value: "root-server" }],
            backend: [
                {
                    label: "backend-shared-server",
                    value: "backend::backend-shared-server",
                },
            ],
        });

        const saved = await readSavedFile();

        expect(saved.get("team")?.selection.mcp).toEqual([
            "backend::backend-shared-server",
        ]);

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
        expect(entry).not.toHaveProperty("clonePath");

        const agentsFile = AgentsFile.parse(
            await readFile(AgentsFile.path(context), "utf8"),
        );

        expect(agentsFile?.clonePathOf("team")).toBe(clonePath);
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

        const gitignore = await readFile(join(cwd, ".gitignore"), "utf8");

        expect(gitignore).not.toContain("remote-sources.json");
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

    it("pins to the newest tag when --pin is given without a value", async () => {
        runGit(originDir, ["tag", "v1.0.0"]);
        await commit(originDir, "second.md", "more");
        runGit(originDir, ["tag", "v1.1.0"]);

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "team",
            originDir,
            "--yes",
            "--pin",
            "--path",
            join(cwd, "clone"),
        ]);

        const saved = await readSavedFile();

        expect(saved.get("team")?.ref).toBe("v1.1.0");
    });

    it("pins to the exact tag given to --pin", async () => {
        runGit(originDir, ["tag", "v1.0.0"]);
        await commit(originDir, "second.md", "more");
        runGit(originDir, ["tag", "v1.1.0"]);

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "team",
            originDir,
            "--yes",
            "--pin",
            "v1.0.0",
            "--path",
            join(cwd, "clone"),
        ]);

        const saved = await readSavedFile();

        expect(saved.get("team")?.ref).toBe("v1.0.0");
    });

    it("throws a trackable CliError when the requested tag does not exist", async () => {
        runGit(originDir, ["tag", "v1.0.0"]);

        await expect(
            program().parseAsync([
                "node",
                "agenteq",
                "remote-source",
                "add",
                "team",
                originDir,
                "--yes",
                "--pin",
                "v9.9.9",
                "--path",
                join(cwd, "clone"),
            ]),
        ).rejects.toMatchObject({ code: "E_REMOTE_SOURCE_TAG_NOT_FOUND" });
    });

    it("throws a trackable CliError when --pin is given but the source has no tags", async () => {
        await expect(
            program().parseAsync([
                "node",
                "agenteq",
                "remote-source",
                "add",
                "team",
                originDir,
                "--yes",
                "--pin",
                "--path",
                join(cwd, "clone"),
            ]),
        ).rejects.toMatchObject({ code: "E_REMOTE_SOURCE_NO_TAGS" });
    });
});

describe("agenteq remote-source add (scriptable selection flags)", () => {
    let originDir: string;

    beforeEach(async () => {
        originDir = await createOrigin();
        await commit(originDir, "GUIDELINES.md", "# Shared\n");

        const skillADir = join(originDir, "skills/skill-a");
        const skillBDir = join(originDir, "skills/skill-b");
        const commandsDir = join(originDir, "commands");
        const mcpDir = join(originDir, "mcp/server-a");

        await mkdir(skillADir, { recursive: true });
        await writeFile(join(skillADir, "SKILL.md"), "hello", "utf8");

        await mkdir(skillBDir, { recursive: true });
        await writeFile(join(skillBDir, "SKILL.md"), "hello", "utf8");

        await mkdir(commandsDir, { recursive: true });
        await writeFile(join(commandsDir, "cmd-a.md"), "hello", "utf8");

        await mkdir(mcpDir, { recursive: true });
        await writeFile(
            join(mcpDir, "config.json"),
            JSON.stringify({ config: { command: "npx" }, type: "stdio" }),
            "utf8",
        );

        runGit(originDir, ["add", "skills", "commands", "mcp"]);
        runGit(originDir, ["commit", "--quiet", "-m", "add capabilities"]);
    });

    afterEach(async () => {
        await rm(originDir, { force: true, recursive: true });
    });

    it("selects only the named skills and skips the picker", async () => {
        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "team",
            originDir,
            "--skills",
            "skill-a",
            "--path",
            join(cwd, "clone"),
        ]);

        const saved = await readSavedFile();
        const selection = saved.get("team")?.selection;

        expect(selection?.skills).toEqual(["skill-a"]);
        expect(selection?.commands).toEqual([]);
        expect(selection?.mcp).toEqual([]);
        expect(selection?.guidelines).toBe(false);
    });

    it("selects the right items per capability when --commands and --mcp are combined", async () => {
        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "team",
            originDir,
            "--commands",
            "cmd-a.md",
            "--mcp",
            "server-a",
            "--path",
            join(cwd, "clone"),
        ]);

        const saved = await readSavedFile();
        const selection = saved.get("team")?.selection;

        expect(selection?.commands).toEqual(["cmd-a.md"]);
        expect(selection?.mcp).toEqual(["server-a"]);
        expect(selection?.skills).toEqual([]);
        expect(selection?.guidelines).toBe(false);
    });

    it("includes guidelines and nothing else when --guidelines is passed alone", async () => {
        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "add",
            "team",
            originDir,
            "--guidelines",
            "--path",
            join(cwd, "clone"),
        ]);

        const saved = await readSavedFile();
        const selection = saved.get("team")?.selection;

        expect(selection?.guidelines).toBe(true);
        expect(selection?.skills).toEqual([]);
        expect(selection?.commands).toEqual([]);
        expect(selection?.mcp).toEqual([]);
    });

    it("throws a trackable CliError when a named skill does not exist", async () => {
        await expect(
            program().parseAsync([
                "node",
                "agenteq",
                "remote-source",
                "add",
                "team",
                originDir,
                "--skills",
                "skill-a,does-not-exist",
                "--path",
                join(cwd, "clone"),
            ]),
        ).rejects.toMatchObject({ code: "E_REMOTE_SOURCE_UNKNOWN_ITEM" });
    });

    it("still runs the interactive picker when no selection flag and no --yes are passed", async () => {
        vi.resetModules();

        const isTTYMock = vi.fn().mockReturnValue(true);
        const isCIMock = vi.fn().mockReturnValue(false);
        const groupMultiselectMock = vi.fn().mockResolvedValue(["skill-a"]);
        const confirmMock = vi.fn().mockResolvedValue(false);
        const isCancelMock = vi.fn().mockReturnValue(false);

        vi.doMock("@clack/prompts", async (importOriginal) => {
            const actual =
                await importOriginal<typeof import("@clack/prompts")>();

            return {
                ...actual,
                confirm: confirmMock,
                groupMultiselect: groupMultiselectMock,
                isCancel: isCancelMock,
                isCI: isCIMock,
                isTTY: isTTYMock,
            };
        });

        const { registerRemoteSourceCommand: registerInteractive } =
            await import("@console/commands/remote-source.js");

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

        expect(groupMultiselectMock).toHaveBeenCalled();

        vi.doUnmock("@clack/prompts");
    });
});

describe("agenteq remote-source pin / unpin", () => {
    let originDir: string;
    let clonePath: string;

    beforeEach(async () => {
        originDir = await createOrigin();
        clonePath = join(cwd, "clone");

        await commit(originDir, "GUIDELINES.md", "v1");
        runGit(originDir, ["tag", "v1.0.0"]);
        await commit(originDir, "second.md", "v2");
        runGit(originDir, ["tag", "v1.1.0"]);

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
    });

    afterEach(async () => {
        await rm(originDir, { force: true, recursive: true });
    });

    it("pins an already-added remote to the newest tag by default", async () => {
        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "pin",
            "team",
        ]);

        const saved = await readSavedFile();

        expect(saved.get("team")?.ref).toBe("v1.1.0");
        expect(git.currentTag({ cwd: clonePath })).toBe("v1.1.0");
    });

    it("pins to an exact tag when one is given", async () => {
        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "pin",
            "team",
            "v1.0.0",
        ]);

        const saved = await readSavedFile();

        expect(saved.get("team")?.ref).toBe("v1.0.0");
        expect(git.currentTag({ cwd: clonePath })).toBe("v1.0.0");
    });

    it("throws a trackable CliError when the remote isn't configured", async () => {
        await expect(
            program().parseAsync([
                "node",
                "agenteq",
                "remote-source",
                "pin",
                "unknown",
            ]),
        ).rejects.toMatchObject({ code: "E_REMOTE_SOURCE_NOT_CONFIGURED" });
    });

    it("goes back to tracking the default branch on unpin", async () => {
        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "pin",
            "team",
            "v1.0.0",
        ]);

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "unpin",
            "team",
        ]);

        const saved = await readSavedFile();

        expect(saved.get("team")?.ref).toBeUndefined();
        expect(await readFile(join(clonePath, "second.md"), "utf8")).toBe("v2");
    });

    it("prints a notice and does nothing when the remote is not pinned", async () => {
        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);

        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "unpin",
            "team",
            "--json",
        ]);

        const payload = JSON.parse(
            writeSpy.mock.calls.map(([chunk]) => String(chunk)).join(""),
        ) as { message: string };

        expect(payload.message).toContain("is not pinned");

        writeSpy.mockRestore();
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

    it("drops a saved value no longer offered instead of carrying it into the new selection", async () => {
        const originDir = await createOrigin();

        await commit(originDir, "GUIDELINES.md", "# Shared\n");

        const mcpDir = join(originDir, "mcp/shared-http-server");

        await mkdir(mcpDir, { recursive: true });
        await writeFile(
            join(mcpDir, "config.json"),
            JSON.stringify({
                config: { url: "https://example.com/mcp" },
                type: "http",
            }),
            "utf8",
        );

        runGit(originDir, ["add", "mcp"]);
        runGit(originDir, ["commit", "--quiet", "-m", "add mcp server"]);

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

        // A stale saved value this repository's current mcp servers no longer match.
        const saved = await readSavedFile();
        const savedEntry = saved.get("team");

        if (!savedEntry) {
            throw new Error("Expected the team remote to be saved already.");
        }

        await saveRemoteSourcesFileAction({
            context: context,
            remotes: {
                team: {
                    selection: {
                        ...savedEntry.selection,
                        mcp: ["backend-shared-server"],
                    },
                    url: originDir,
                },
            },
            shouldIgnore: false,
        });

        vi.resetModules();

        const isTTYMock = vi.fn().mockReturnValue(true);
        const isCIMock = vi.fn().mockReturnValue(false);

        const groupMultiselectMock = vi
            .fn()
            .mockResolvedValue(["shared-http-server"]);

        const confirmMock = vi.fn().mockResolvedValue(true);
        const isCancelMock = vi.fn().mockReturnValue(false);

        vi.doMock("@clack/prompts", async (importOriginal) => {
            const actual =
                await importOriginal<typeof import("@clack/prompts")>();

            return {
                ...actual,
                confirm: confirmMock,
                groupMultiselect: groupMultiselectMock,
                isCancel: isCancelMock,
                isCI: isCIMock,
                isTTY: isTTYMock,
            };
        });

        const { registerRemoteSourceCommand: registerInteractive } =
            await import("@console/commands/remote-source.js");

        const cmd = new Command();

        cmd.exitOverride();
        registerInteractive(cmd);

        await cmd.parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "update-choices",
            "team",
        ]);

        const mcpCall = groupMultiselectMock.mock.calls.find(([params]) =>
            String(params.message).includes("MCP servers"),
        );

        expect(mcpCall?.[0].initialValues).not.toContain(
            "backend-shared-server",
        );

        const updated = await readSavedFile();

        expect(updated.get("team")?.selection.mcp).toEqual([
            "shared-http-server",
        ]);

        vi.doUnmock("@clack/prompts");
        await rm(originDir, { force: true, recursive: true });
    });
});

describe("agenteq remote-source update-choices (scriptable selection flags)", () => {
    let originDir: string;

    beforeEach(async () => {
        originDir = await createOrigin();
        await commit(originDir, "GUIDELINES.md", "# Shared\n");

        const skillADir = join(originDir, "skills/skill-a");
        const commandsDir = join(originDir, "commands");

        await mkdir(skillADir, { recursive: true });
        await writeFile(join(skillADir, "SKILL.md"), "hello", "utf8");

        await mkdir(commandsDir, { recursive: true });
        await writeFile(join(commandsDir, "cmd-a.md"), "hello", "utf8");

        runGit(originDir, ["add", "skills", "commands"]);
        runGit(originDir, ["commit", "--quiet", "-m", "add capabilities"]);

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
    });

    afterEach(async () => {
        await rm(originDir, { force: true, recursive: true });
    });

    it("replaces the saved selection with the named skill and skips the picker", async () => {
        await program().parseAsync([
            "node",
            "agenteq",
            "remote-source",
            "update-choices",
            "team",
            "--skills",
            "skill-a",
        ]);

        const saved = await readSavedFile();
        const selection = saved.get("team")?.selection;

        expect(selection?.skills).toEqual(["skill-a"]);
        expect(selection?.commands).toEqual([]);
        expect(selection?.guidelines).toBe(false);
    });

    it("throws a trackable CliError when a named command does not exist", async () => {
        await expect(
            program().parseAsync([
                "node",
                "agenteq",
                "remote-source",
                "update-choices",
                "team",
                "--commands",
                "does-not-exist.md",
            ]),
        ).rejects.toMatchObject({ code: "E_REMOTE_SOURCE_UNKNOWN_ITEM" });
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
