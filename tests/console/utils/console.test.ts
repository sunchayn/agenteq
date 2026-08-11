import { afterEach, describe, expect, it, vi } from "vitest";
import { printMessage } from "@console/utils/console.js";
import output from "@infrastructure/terminal/output.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("printMessage: plain text mode", () => {
    it("prints through the matching output level", () => {
        const errorSpy = vi
            .spyOn(output, "error")
            .mockImplementation(() => undefined);

        printMessage({ isJson: false, level: "error", message: "boom" });

        expect(errorSpy).toHaveBeenCalledWith("boom");
    });
});

describe("printMessage: json mode", () => {
    it("writes a uniformly-shaped JSON payload instead of calling the output level", () => {
        const warnSpy = vi
            .spyOn(output, "warn")
            .mockImplementation(() => undefined);

        const writeSpy = vi
            .spyOn(output, "writeRaw")
            .mockImplementation(() => undefined);

        printMessage({ isJson: true, level: "warn", message: "heads up" });

        expect(warnSpy).not.toHaveBeenCalled();
        expect(writeSpy).toHaveBeenCalledTimes(1);

        const written = writeSpy.mock.calls[0]?.[0] ?? "";

        expect(JSON.parse(written)).toEqual({
            level: "warn",
            message: "heads up",
        });
    });
});
