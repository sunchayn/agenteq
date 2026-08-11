import { describe, expect, it } from "vitest";
import shell from "@infrastructure/shell.js";

describe("shell.commandExistsOnPath", () => {
    it("is true for a command that resolves on PATH", async () => {
        expect(await shell.commandExistsOnPath("node")).toBe(true);
    });

    it("is false for a command that doesn't resolve", async () => {
        expect(
            await shell.commandExistsOnPath("definitely-not-a-real-binary-xyz"),
        ).toBe(false);
    });
});
