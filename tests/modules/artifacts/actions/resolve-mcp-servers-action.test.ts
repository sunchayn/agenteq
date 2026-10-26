import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import resolveMcpServersAction from "@artifacts/actions/resolve-mcp-servers-action.js";

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

describe("resolveMcpServersAction", () => {
    it("captures unknown fields into `extra` instead of rejecting them", async () => {
        await writeConfig("example", {
            config: { command: "npx", timeout: 30, trust: true },
            type: "stdio",
        });

        const [server] = await resolveMcpServersAction({
            cwd: cwd,
            files: [".ai/mcp/example/config.json"],
        });

        expect(server.extra).toEqual({ timeout: 30, trust: true });
    });

    it("returns no `extra` when every field is known", async () => {
        await writeConfig("example", {
            config: { command: "npx" },
            type: "stdio",
        });

        const [server] = await resolveMcpServersAction({
            cwd: cwd,
            files: [".ai/mcp/example/config.json"],
        });

        expect(server.extra).toBeUndefined();
    });

    it("throws a clear error for an invalid config", async () => {
        await writeConfig("bad", { config: {}, type: "stdio" });

        await expect(
            resolveMcpServersAction({
                cwd: cwd,
                files: [".ai/mcp/bad/config.json"],
            }),
        ).rejects.toThrow(/command/);
    });

    it("uses the config's own directory name as its key", async () => {
        await writeConfig("renamed-server", {
            config: { command: "npx" },
            type: "stdio",
        });

        const [server] = await resolveMcpServersAction({
            cwd: cwd,
            files: [".ai/mcp/renamed-server/config.json"],
        });

        expect(server.key).toBe("renamed-server");
    });

    it("resolves only the given files, ignoring any other config on disk", async () => {
        await writeConfig("example", {
            config: { command: "npx" },
            type: "stdio",
        });

        await writeConfig("other", {
            config: { command: "npx" },
            type: "stdio",
        });

        const servers = await resolveMcpServersAction({
            cwd: cwd,
            files: [".ai/mcp/example/config.json"],
        });

        expect(servers.map((server) => server.key)).toEqual(["example"]);
    });

    it("normalizes a single envFile path into a one-item list", async () => {
        await writeConfig("example", {
            config: { command: "npx", envFile: ".env" },
            type: "stdio",
        });

        const [server] = await resolveMcpServersAction({
            cwd: cwd,
            files: [".ai/mcp/example/config.json"],
        });

        expect(server.envFile).toEqual([".env"]);
        expect(server.extra).toBeUndefined();
    });

    it("keeps an envFile list as given", async () => {
        await writeConfig("example", {
            config: { command: "npx", envFile: [".env", ".env.local"] },
            type: "stdio",
        });

        const [server] = await resolveMcpServersAction({
            cwd: cwd,
            files: [".ai/mcp/example/config.json"],
        });

        expect(server.envFile).toEqual([".env", ".env.local"]);
    });

    it("leaves envFile undefined when the config has none", async () => {
        await writeConfig("example", {
            config: { command: "npx" },
            type: "stdio",
        });

        const [server] = await resolveMcpServersAction({
            cwd: cwd,
            files: [".ai/mcp/example/config.json"],
        });

        expect(server.envFile).toBeUndefined();
    });
});
