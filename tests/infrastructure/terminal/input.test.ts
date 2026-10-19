import { describe, expect, it, vi } from "vitest";
import { GroupMultiSelectPrompt } from "@clack/core";

const {
    confirmMock,
    groupMultiselectMock,
    isCancelMock,
    isCIMock,
    isTTYMock,
    multiselectMock,
    textMock,
} = vi.hoisted(() => ({
    confirmMock: vi.fn(),
    groupMultiselectMock: vi.fn(),
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
        groupMultiselect: groupMultiselectMock,
        isCancel: isCancelMock,
        isCI: isCIMock,
        isTTY: isTTYMock,
        multiselect: multiselectMock,
        text: textMock,
    };
});

const { attachReactiveMarkerToggle, default: input } = await import(
    "@infrastructure/terminal/input.js"
);

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

    it("drops an initial value no option offers before calling clack", async () => {
        multiselectMock.mockResolvedValue([]);

        await input.multiselect({
            initialValues: ["claude_code", "stale_agent"],
            message: "Select agents to sync",
            options: [{ label: "Claude Code", value: "claude_code" }],
        });

        expect(multiselectMock).toHaveBeenCalledWith(
            expect.objectContaining({ initialValues: ["claude_code"] }),
        );
    });
});

describe("input.groupMultiselect", () => {
    it("forwards params to clack and resolves with its answer", async () => {
        groupMultiselectMock.mockResolvedValue(["backend::foo"]);

        const params = {
            initialValues: [],
            message: "Select skills to sync from this source",
            options: {
                "(root)": [{ label: "foo", value: "foo" }],
                backend: [{ label: "backend::foo", value: "backend::foo" }],
            },
        };

        await expect(input.groupMultiselect(params)).resolves.toEqual([
            "backend::foo",
        ]);

        expect(groupMultiselectMock).toHaveBeenCalledWith(params);
    });

    it("drops an initial value no option offers before calling clack", async () => {
        groupMultiselectMock.mockResolvedValue([]);

        await input.groupMultiselect({
            initialValues: ["foo", "stale-server"],
            message: "Select mcp servers to sync from this source",
            options: {
                "(root)": [{ label: "foo", value: "foo" }],
            },
        });

        expect(groupMultiselectMock).toHaveBeenCalledWith(
            expect.objectContaining({ initialValues: ["foo"] }),
        );
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

describe("input.groupMultiselect with reactiveMarkers", () => {
    it("patches and restores GroupMultiSelectPrompt.prototype.prompt around one call", async () => {
        // eslint-disable-next-line @typescript-eslint/unbound-method -- compared by reference, never called detached.
        const originalPrompt = GroupMultiSelectPrompt.prototype.prompt;

        groupMultiselectMock.mockResolvedValue(["backend::*"]);

        await input.groupMultiselect({
            initialValues: [],
            message: "Select skills to sync from this source",
            options: {
                backend: [
                    { label: "foo", value: "backend::foo" },
                    { label: "* (current and future)", value: "backend::*" },
                ],
            },
            reactiveMarkers: ["backend::*"],
        });

        // eslint-disable-next-line @typescript-eslint/unbound-method -- compared by reference, never called detached.
        expect(GroupMultiSelectPrompt.prototype.prompt).toBe(originalPrompt);
    });

    it("never patches the prototype when no marker is given", async () => {
        // eslint-disable-next-line @typescript-eslint/unbound-method -- compared by reference, never called detached.
        const originalPrompt = GroupMultiSelectPrompt.prototype.prompt;

        groupMultiselectMock.mockResolvedValue([]);

        await input.groupMultiselect({
            initialValues: [],
            message: "Select skills to sync from this source",
            options: { backend: [{ label: "foo", value: "backend::foo" }] },
        });

        // eslint-disable-next-line @typescript-eslint/unbound-method -- compared by reference, never called detached.
        expect(GroupMultiSelectPrompt.prototype.prompt).toBe(originalPrompt);
    });
});

describe("attachReactiveMarkerToggle", () => {
    function buildPrompt(initialValues: string[] = []) {
        return new GroupMultiSelectPrompt({
            initialValues: initialValues,
            options: {
                backend: [
                    { label: "foo", value: "backend::foo" },
                    { label: "bar", value: "backend::bar" },
                    { label: "* (current and future)", value: "backend::*" },
                ],
            },
            render: () => "",
        });
    }

    it("selects every other item in the group once the marker is toggled on", () => {
        const prompt = buildPrompt();

        attachReactiveMarkerToggle(prompt, new Set(["backend::*"]));

        prompt.cursor = prompt.options.findIndex(
            (option) => option.value === "backend::*",
        );

        prompt.emit("cursor", "space");
        prompt.emit("key", " ", { name: "space" });

        expect(prompt.value).toEqual(
            expect.arrayContaining([
                "backend::*",
                "backend::foo",
                "backend::bar",
            ]),
        );
    });

    it("deselects every other item in the group once the marker is toggled off", () => {
        const prompt = buildPrompt([
            "backend::*",
            "backend::foo",
            "backend::bar",
        ]);

        attachReactiveMarkerToggle(prompt, new Set(["backend::*"]));

        prompt.cursor = prompt.options.findIndex(
            (option) => option.value === "backend::*",
        );

        prompt.emit("cursor", "space");
        prompt.emit("key", " ", { name: "space" });

        expect(prompt.value).toEqual([]);
    });

    it("leaves a non-marker row's own toggle untouched", () => {
        const prompt = buildPrompt();

        attachReactiveMarkerToggle(prompt, new Set(["backend::*"]));

        prompt.cursor = prompt.options.findIndex(
            (option) => option.value === "backend::foo",
        );

        prompt.emit("cursor", "space");
        prompt.emit("key", " ", { name: "space" });

        expect(prompt.value).toEqual(["backend::foo"]);
    });

    it("ignores a non-space key even while the cursor sits on the marker", () => {
        const prompt = buildPrompt();

        attachReactiveMarkerToggle(prompt, new Set(["backend::*"]));

        prompt.cursor = prompt.options.findIndex(
            (option) => option.value === "backend::*",
        );

        prompt.emit("key", "j", { name: "down" });

        expect(prompt.value).toEqual([]);
    });
});
