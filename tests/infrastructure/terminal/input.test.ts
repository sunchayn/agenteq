import { describe, expect, it, vi } from "vitest";

const {
    confirmMock,
    isCancelMock,
    isCIMock,
    isTTYMock,
    multiselectMock,
    textMock,
} = vi.hoisted(() => ({
    confirmMock: vi.fn(),
    isCancelMock: vi.fn(),
    isCIMock: vi.fn(),
    isTTYMock: vi.fn(),
    multiselectMock: vi.fn(),
    textMock: vi.fn(),
}));

vi.mock("@clack/prompts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@clack/prompts")>();

    return {
        ...actual,
        confirm: confirmMock,
        isCancel: isCancelMock,
        isCI: isCIMock,
        isTTY: isTTYMock,
        multiselect: multiselectMock,
        text: textMock,
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

describe("input.text", () => {
    it("forwards params to clack and resolves with its answer", async () => {
        textMock.mockResolvedValue("~/.agenteq/sources/team");

        const params = {
            defaultValue: "~/.agenteq/sources/team",
            message: "Where should this be cloned",
        };

        await expect(input.text(params)).resolves.toBe(
            "~/.agenteq/sources/team",
        );

        expect(textMock).toHaveBeenCalledWith(params);
    });
});

describe("input.confirm", () => {
    it("forwards params to clack and resolves with its answer", async () => {
        confirmMock.mockResolvedValue(true);

        const params = { message: "Include GUIDELINES.md" };

        await expect(input.confirm(params)).resolves.toBe(true);
        expect(confirmMock).toHaveBeenCalledWith(params);
    });
});
