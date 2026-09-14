import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import loadRemoteSourcesFileAction from "@artifacts/actions/load-remote-sources-file-action.js";
import RemoteSourcesFile from "@artifacts/entities/remote-sources-file.js";
import type { RunContext } from "@shared/types/run-context.js";

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-load-remote-sources-file-"));
    context = { cwd: cwd, sourceDir: ".ai" };
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("loadRemoteSourcesFileAction", () => {
    it("returns an empty file when no remote sources file exists", async () => {
        expect(
            (await loadRemoteSourcesFileAction({ context: context })).isEmpty(),
        ).toBe(true);
    });

    it("returns an empty file for a malformed remote sources file", async () => {
        await mkdir(dirname(RemoteSourcesFile.path(context)), {
            recursive: true,
        });

        await writeFile(RemoteSourcesFile.path(context), "not json", "utf8");

        expect(
            (await loadRemoteSourcesFileAction({ context: context })).isEmpty(),
        ).toBe(true);
    });

    it("returns a parsed RemoteSourcesFile with every remote for a valid file", async () => {
        await mkdir(dirname(RemoteSourcesFile.path(context)), {
            recursive: true,
        });

        await writeFile(
            RemoteSourcesFile.path(context),
            JSON.stringify({
                remotes: {
                    team: {
                        clonePath: "/tmp/clone",
                        selection: {
                            commands: [],
                            guidelines: false,
                            mcp: [],
                            skills: [],
                        },
                        url: "git@example.com",
                    },
                },
            }),
            "utf8",
        );

        const result = await loadRemoteSourcesFileAction({ context: context });

        expect(result.get("team")?.url).toBe("git@example.com");
        expect(result.get("team")?.clonePath).toBe("/tmp/clone");
    });
});
