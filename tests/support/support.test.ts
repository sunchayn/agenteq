import { homedir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CliError } from "@support/errors/cli-error.js";
import { expandPath } from "@support/utils/expand-path.js";
import { shellEscape } from "@support/utils/shell-escape.js";

describe("CliError", () => {
    it("prefixes the message with a trackable code", () => {
        const error = new CliError("E_UNKNOWN_AGENT", 'Unknown agent "foo".');

        expect(error.message).toBe('(E_UNKNOWN_AGENT) Unknown agent "foo".');
        expect(error.code).toBe("E_UNKNOWN_AGENT");
        expect(error).toBeInstanceOf(Error);
    });
});

describe("expandPath", () => {
    it("expands a leading ~ to the home directory", () => {
        expect(expandPath("~/config.json")).toBe(`${homedir()}/config.json`);
    });

    it("leaves a path with no ~ or env reference untouched", () => {
        expect(expandPath("/etc/config.json")).toBe("/etc/config.json");
    });

    describe("environment variable expansion", () => {
        const originalValue = process.env.AGENTEQ_TEST_VAR;

        beforeEach(() => {
            process.env.AGENTEQ_TEST_VAR = "/resolved";
        });

        afterEach(() => {
            if (originalValue === undefined) {
                delete process.env.AGENTEQ_TEST_VAR;
            } else {
                process.env.AGENTEQ_TEST_VAR = originalValue;
            }
        });

        it("expands a $VAR reference", () => {
            expect(expandPath("$AGENTEQ_TEST_VAR/config.json")).toBe(
                "/resolved/config.json",
            );
        });

        it("expands a %VAR% reference", () => {
            expect(expandPath("%AGENTEQ_TEST_VAR%/config.json")).toBe(
                "/resolved/config.json",
            );
        });

        it("leaves an unresolvable variable reference as-is", () => {
            expect(expandPath("$DEFINITELY_NOT_SET_XYZ/x")).toBe(
                "$DEFINITELY_NOT_SET_XYZ/x",
            );
        });
    });
});

describe("shellEscape", () => {
    const originalPlatform = process.platform;

    function setPlatform(platform: NodeJS.Platform): void {
        Object.defineProperty(process, "platform", { value: platform });
    }

    afterEach(() => {
        setPlatform(originalPlatform);
    });

    describe("posix", () => {
        beforeEach(() => setPlatform("linux"));

        it("wraps a plain value in single quotes", () => {
            expect(shellEscape("hello")).toBe("'hello'");
        });

        it("neutralizes an embedded single quote instead of breaking out of the string", () => {
            expect(shellEscape("hello'; rm -rf ~; echo '")).toBe(
                "'hello'\\''; rm -rf ~; echo '\\'''",
            );
        });

        it("does not need escaping for double quotes, backticks, or semicolons since the whole value is single-quoted", () => {
            const malicious = '`whoami`; echo "pwned"';
            const escaped = shellEscape(malicious);

            // The entire payload must be trapped inside a single-quoted literal.
            expect(escaped.startsWith("'")).toBe(true);
            expect(escaped.endsWith("'")).toBe(true);
            expect(escaped).toContain(malicious);
        });
    });

    describe("win32", () => {
        beforeEach(() => setPlatform("win32"));

        it("wraps a plain value in double quotes", () => {
            expect(shellEscape("hello")).toBe('"hello"');
        });

        it("doubles embedded double quotes", () => {
            expect(shellEscape('say "hi"')).toBe('"say ""hi"""');
        });
    });
});
