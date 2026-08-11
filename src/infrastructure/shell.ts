import { spawn } from "node:child_process";
import { shellEscape } from "@support/utils/shell-escape.js";

/**
 * A standardized service for shell operations.
 */
export default {
    commandExistsOnPath: commandExistsOnPath,
};

/*
 * Internal.
 */

/**
 * Checks whether a command resolves on PATH via the shell's own lookup,
 * `where` on Windows or `command -v` elsewhere.
 */
async function commandExistsOnPath(command: string): Promise<boolean> {
    const [bin, args] =
        process.platform === "win32"
            ? ["cmd", ["/c", "where", command]]
            : ["sh", ["-c", `command -v ${shellEscape(command)}`]];

    return new Promise((resolvePromise) => {
        const child = spawn(bin, args, { stdio: "ignore" });

        child.on("error", () => {
            resolvePromise(false);
        });

        child.on("exit", (code) => {
            resolvePromise(code === 0);
        });
    });
}
