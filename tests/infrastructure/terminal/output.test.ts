import { describe, expect, it, vi } from "vitest";

const messages: string[] = [];

vi.mock("@clack/prompts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@clack/prompts")>();

    return {
        ...actual,
        log: { ...actual.log, message: (text: string) => messages.push(text) },
    };
});

const { default: output } = await import("@infrastructure/terminal/output.js");

describe("output.write", () => {
    it("writes raw text straight to stdout, with no box-drawing decoration", () => {
        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);

        output.writeRaw('{\n  "hello": "world"\n}\n');

        expect(writeSpy).toHaveBeenCalledWith('{\n  "hello": "world"\n}\n');

        writeSpy.mockRestore();
    });

    it("never routes through log.message, so JSON payloads stay parseable", () => {
        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);

        const payload = { level: "warn", message: "heads up" };

        output.writeRaw(`${JSON.stringify(payload)}\n`);

        const written = writeSpy.mock.calls[0]?.[0] as string;

        expect(JSON.parse(written)).toEqual(payload);

        writeSpy.mockRestore();
    });
});

describe("output.table", () => {
    it("pads every column to its widest cell, including the header", () => {
        messages.length = 0;

        output.table(
            ["Agent", "Status"],
            [
                ["Claude Code", "written"],
                ["Cursor", "skipped"],
            ],
        );

        const lines = messages[0]?.split("\n") ?? [];

        expect(lines).toHaveLength(4);
        expect(lines[1]).toBe(`${"-".repeat(11)}  ${"-".repeat(7)}`);
        expect(lines[2]).toBe(
            `${"Claude Code".padEnd(11)}  ${"written".padEnd(7)}`,
        );

        expect(lines[3]).toBe(`${"Cursor".padEnd(11)}  ${"skipped".padEnd(7)}`);
    });

    it("renders just the header and separator for an empty row set", () => {
        messages.length = 0;

        output.table(["A", "B"], []);

        expect(messages[0]?.split("\n")).toEqual(["A  B", "-  -"]);
    });

    it("aligns columns even when a cell carries ANSI color codes", () => {
        messages.length = 0;

        const green = (text: string) => `\x1b[32m${text}\x1b[39m`;

        output.table(
            ["Agent", "Status"],
            [
                ["Claude Code", green("yes")],
                ["Cursor", "no"],
            ],
        );

        const lines = messages[0]?.split("\n") ?? [];

        expect(lines[2]).toBe(
            `${"Claude Code".padEnd(11)}  ${green("yes")}${" ".repeat(3)}`,
        );

        expect(lines[3]).toBe(`${"Cursor".padEnd(11)}  ${"no".padEnd(6)}`);
    });
});
