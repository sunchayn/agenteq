import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import resolveBoostAgentsAction from "@agents/actions/resolve-boost-agents-action.js";
import claudeCode from "@agents/definitions/claude-code.js";
import cursor from "@agents/definitions/cursor.js";
import type { RunContext } from "@shared/types/run-context.js";

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-resolve-boost-agents-"));
    context = { cwd: cwd, sourceDir: ".ai" };
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("resolveBoostAgentsAction", () => {
    it("returns undefined when no boost.json exists", async () => {
        expect(
            await resolveBoostAgentsAction({ context: context }),
        ).toBeUndefined();
    });

    it("resolves the agents boost.json names to real Agent objects", async () => {
        await writeFile(
            join(cwd, "boost.json"),
            JSON.stringify({ agents: ["claude_code", "cursor"] }),
        );

        expect(await resolveBoostAgentsAction({ context: context })).toEqual([
            claudeCode,
            cursor,
        ]);
    });

    it("drops an agent name boost.json lists that agenteq does not know", async () => {
        await writeFile(
            join(cwd, "boost.json"),
            JSON.stringify({ agents: ["claude_code", "some_unknown_agent"] }),
        );

        expect(await resolveBoostAgentsAction({ context: context })).toEqual([
            claudeCode,
        ]);
    });

    it("returns undefined when boost.json names no known agent", async () => {
        await writeFile(
            join(cwd, "boost.json"),
            JSON.stringify({ agents: ["some_unknown_agent"] }),
        );

        expect(
            await resolveBoostAgentsAction({ context: context }),
        ).toBeUndefined();
    });

    it("returns undefined when boost.json is not valid JSON", async () => {
        await writeFile(join(cwd, "boost.json"), "not valid json {{{");

        expect(
            await resolveBoostAgentsAction({ context: context }),
        ).toBeUndefined();
    });

    it("returns undefined when boost.json has no agents field", async () => {
        await writeFile(
            join(cwd, "boost.json"),
            JSON.stringify({ guidelines: true }),
        );

        expect(
            await resolveBoostAgentsAction({ context: context }),
        ).toBeUndefined();
    });
});
