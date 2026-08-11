import { afterEach, describe, expect, it } from "vitest";
import env from "@infrastructure/env.js";

const KEY = "AGENTEQ_TEST_VAR";

afterEach(() => {
    delete process.env[KEY];
});

describe("env.readFlag", () => {
    it("is true for '1' and 'true' (case-insensitive)", () => {
        process.env[KEY] = "1";
        expect(env.readFlag(KEY)).toBe(true);
        process.env[KEY] = "TRUE";
        expect(env.readFlag(KEY)).toBe(true);
    });

    it("is false when unset or any other value", () => {
        expect(env.readFlag(KEY)).toBe(false);
        process.env[KEY] = "0";
        expect(env.readFlag(KEY)).toBe(false);
        process.env[KEY] = "yes";
        expect(env.readFlag(KEY)).toBe(false);
    });
});

describe("env.readString", () => {
    it("returns the value when set", () => {
        process.env[KEY] = "claude_code,cursor";
        expect(env.readString(KEY)).toBe("claude_code,cursor");
    });

    it("returns undefined when unset or empty", () => {
        expect(env.readString(KEY)).toBeUndefined();
        process.env[KEY] = "";
        expect(env.readString(KEY)).toBeUndefined();
    });
});
