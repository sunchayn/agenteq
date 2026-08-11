import { describe, expect, it, vi } from "vitest";

const { isCancelMock, isCIMock, isTTYMock, multiselectMock } = vi.hoisted(
    () => ({
        isCancelMock: vi.fn(),
        isCIMock: vi.fn(),
        isTTYMock: vi.fn(),
        multiselectMock: vi.fn(),
    }),
);

vi.mock("@clack/prompts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@clack/prompts")>();

    return {
        ...actual,
        isCancel: isCancelMock,
        isCI: isCIMock,
        isTTY: isTTYMock,
        multiselect: multiselectMock,
    };
});

const { default: input } = await import("@infrastructure/terminal/input.js");

describe("input.isInteractive", () => {
    it("is true for a TTY outside CI", () => {
        isTTYMock.mockReturnValue(true);
        isCIMock.mockReturnValue(false);

        expect(input.isInteractive()).toBe(true);
        expect(isTTYMock).toHaveBeenCalledWith(process.stdout);
    });

    it("is false without a TTY", () => {
        isTTYMock.mockReturnValue(false);
        isCIMock.mockReturnValue(false);

        expect(input.isInteractive()).toBe(false);
    });

    it("is false inside CI even with a TTY", () => {
        isTTYMock.mockReturnValue(true);
        isCIMock.mockReturnValue(true);

        expect(input.isInteractive()).toBe(false);
    });
});

describe("input.isCancel", () => {
    it("forwards the value to clack and returns its verdict", () => {
        isCancelMock.mockReturnValue(true);

        const cancelledValue = Symbol("clack:cancel");

        expect(input.isCancel(cancelledValue)).toBe(true);
        expect(isCancelMock).toHaveBeenCalledWith(cancelledValue);
    });

    it("is false for a real answer", () => {
        isCancelMock.mockReturnValue(false);

        expect(input.isCancel(["claude_code"])).toBe(false);
    });
});

describe("input.multiselect", () => {
    it("forwards params to clack and resolves with its answer", async () => {
        multiselectMock.mockResolvedValue(["claude_code"]);

        const params = {
            initialValues: ["claude_code"],
            message: "Select agents to sync",
            options: [{ label: "Claude Code", value: "claude_code" }],
        };

        await expect(input.multiselect(params)).resolves.toEqual([
            "claude_code",
        ]);

        expect(multiselectMock).toHaveBeenCalledWith(params);
    });
});
