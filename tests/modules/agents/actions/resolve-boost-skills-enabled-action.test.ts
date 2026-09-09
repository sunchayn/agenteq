import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import resolveBoostSkillsEnabledAction from "@agents/actions/resolve-boost-skills-enabled-action.js";
import type { RunContext } from "@shared/types/run-context.js";

let cwd: string;
let context: RunContext;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-resolve-boost-skills-"));
    context = { cwd: cwd, sourceDir: ".ai" };
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
});

describe("resolveBoostSkillsEnabledAction", () => {
    it("returns false when no boost.json exists", async () => {
        expect(
            await resolveBoostSkillsEnabledAction({ context: context }),
        ).toBe(false);
    });

    it("returns true when boost.json lists at least one skill", async () => {
        await writeFile(
            join(cwd, "boost.json"),
            JSON.stringify({ skills: ["boost"] }),
        );

        expect(
            await resolveBoostSkillsEnabledAction({ context: context }),
        ).toBe(true);
    });

    it("returns false when boost.json's skills array is empty", async () => {
        await writeFile(
            join(cwd, "boost.json"),
            JSON.stringify({ skills: [] }),
        );

        expect(
            await resolveBoostSkillsEnabledAction({ context: context }),
        ).toBe(false);
    });

    it("returns false when boost.json has no skills field", async () => {
        await writeFile(
            join(cwd, "boost.json"),
            JSON.stringify({ agents: ["claude_code"] }),
        );

        expect(
            await resolveBoostSkillsEnabledAction({ context: context }),
        ).toBe(false);
    });

    it("returns false when boost.json is not valid JSON", async () => {
        await writeFile(join(cwd, "boost.json"), "not valid json {{{");

        expect(
            await resolveBoostSkillsEnabledAction({ context: context }),
        ).toBe(false);
    });
});
