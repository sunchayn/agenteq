import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import discoverMcpServersAction from "@artifacts/actions/discover-mcp-servers-action.js";

let cwd: string;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-mcp-sources-"));
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

async function writeConfig(name: string, contents: unknown): Promise<void> {
    const dir = join(cwd, ".ai/mcp", name);

    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "config.json"), JSON.stringify(contents));
}

describe("discoverMcpServersAction", () => {
    it("captures unknown fields into `extra` instead of rejecting them", async () => {
        await writeConfig("example", {
            config: { command: "npx", timeout: 30, trust: true },
            type: "stdio",
        });

        const [server] = await discoverMcpServersAction({ cwd: cwd });

        expect(server.extra).toEqual({ timeout: 30, trust: true });
    });

    it("returns no `extra` when every field is known", async () => {
        await writeConfig("example", {
            config: { command: "npx" },
            type: "stdio",
        });

        const [server] = await discoverMcpServersAction({ cwd: cwd });

        expect(server.extra).toBeUndefined();
    });

    it("throws a clear error for an invalid config", async () => {
        await writeConfig("bad", { config: {}, type: "stdio" });

        await expect(discoverMcpServersAction({ cwd: cwd })).rejects.toThrow(
            /command/,
        );
    });

    it("uses the config's own directory name as its key", async () => {
        await writeConfig("renamed-server", {
            config: { command: "npx" },
            type: "stdio",
        });

        const [server] = await discoverMcpServersAction({ cwd: cwd });

        expect(server.key).toBe("renamed-server");
    });

    it("ignores a config nested outside sourceDir when not recursive", async () => {
        await mkdir(join(cwd, "backend/mcp/nested"), { recursive: true });
        await writeFile(
            join(cwd, "backend/mcp/nested/config.json"),
            JSON.stringify({
                config: { command: "npx" },
                type: "stdio",
            }),
        );

        const servers = await discoverMcpServersAction({ cwd: cwd });

        expect(servers).toEqual([]);
    });

    it("finds a config nested under any folder when recursive", async () => {
        await mkdir(join(cwd, "backend/mcp/nested"), { recursive: true });
        await writeFile(
            join(cwd, "backend/mcp/nested/config.json"),
            JSON.stringify({
                config: { command: "npx" },
                type: "stdio",
            }),
        );

        const servers = await discoverMcpServersAction({
            cwd: cwd,
            recursive: true,
            sourceDir: ".",
        });

        expect(servers.map((server) => server.key)).toEqual(["nested"]);
    });
});
