import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerMcpCommand } from "@console/commands/mcp.js";
import { createProgram } from "./command-test-helpers.js";

let cwd: string;
let outputFile: string;
const originalValue = process.env.AGENTEQ_TEST_VAR;

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "agenteq-mcp-exec-"));
    outputFile = join(cwd, "out.txt");
});

afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });

    if (originalValue === undefined) {
        delete process.env.AGENTEQ_TEST_VAR;
    } else {
        process.env.AGENTEQ_TEST_VAR = originalValue;
    }
});

/**
 * Spawns node, writing the given env var's resolved value to outputFile.
 */
function writeVarScript(name: string): string[] {
    return [
        process.execPath,
        "-e",
        `require("fs").writeFileSync(process.argv[1], process.env.${name} ?? "");`,
        outputFile,
    ];
}

describe("agenteq mcp exec", () => {
    it("resolves a placeholder already forwarded in the process env using the env file", async () => {
        await writeFile(join(cwd, ".env"), "AGENTEQ_TEST_VAR=from-file\n");
        process.env.AGENTEQ_TEST_VAR = "${AGENTEQ_TEST_VAR}";

        const program = createProgram(registerMcpCommand);

        await program.parseAsync([
            "node",
            "agenteq",
            "mcp",
            "exec",
            "--dotenv",
            join(cwd, ".env"),
            "--",
            ...writeVarScript("AGENTEQ_TEST_VAR"),
        ]);

        await expect(readFile(outputFile, "utf8")).resolves.toBe("from-file");
    });

    it("prefers a real process value over the env file", async () => {
        await writeFile(join(cwd, ".env"), "AGENTEQ_TEST_VAR=from-file\n");
        process.env.AGENTEQ_TEST_VAR = "from-process";

        const program = createProgram(registerMcpCommand);

        await program.parseAsync([
            "node",
            "agenteq",
            "mcp",
            "exec",
            "--dotenv",
            join(cwd, ".env"),
            "--",
            ...writeVarScript("AGENTEQ_TEST_VAR"),
        ]);

        await expect(readFile(outputFile, "utf8")).resolves.toBe(
            "from-process",
        );
    });

    it("lets an earlier --dotenv win a key collision over a later one", async () => {
        await writeFile(join(cwd, "a.env"), "AGENTEQ_TEST_VAR=from-a\n");
        await writeFile(join(cwd, "b.env"), "AGENTEQ_TEST_VAR=from-b\n");
        process.env.AGENTEQ_TEST_VAR = "${AGENTEQ_TEST_VAR}";

        const program = createProgram(registerMcpCommand);

        await program.parseAsync([
            "node",
            "agenteq",
            "mcp",
            "exec",
            "--dotenv",
            join(cwd, "a.env"),
            "--dotenv",
            join(cwd, "b.env"),
            "--",
            ...writeVarScript("AGENTEQ_TEST_VAR"),
        ]);

        await expect(readFile(outputFile, "utf8")).resolves.toBe("from-a");
    });

    it("silently ignores a missing --dotenv path", async () => {
        process.env.AGENTEQ_TEST_VAR = "from-process";

        const program = createProgram(registerMcpCommand);

        await program.parseAsync([
            "node",
            "agenteq",
            "mcp",
            "exec",
            "--dotenv",
            join(cwd, "does-not-exist.env"),
            "--",
            ...writeVarScript("AGENTEQ_TEST_VAR"),
        ]);

        await expect(readFile(outputFile, "utf8")).resolves.toBe(
            "from-process",
        );
    });

    it("rejects with a clear error naming the missing var and the files checked", async () => {
        delete process.env.AGENTEQ_TEST_VAR;

        const program = createProgram(registerMcpCommand);

        await expect(
            program.parseAsync([
                "node",
                "agenteq",
                "mcp",
                "exec",
                "--dotenv",
                join(cwd, ".env"),
                "--",
                process.execPath,
                "-e",
                "0",
                "${AGENTEQ_TEST_VAR}",
            ]),
        ).rejects.toThrow(/AGENTEQ_TEST_VAR/);
    });

    it("expands a ${VAR} placeholder inside the real command's own arguments", async () => {
        await writeFile(join(cwd, ".env"), "AGENTEQ_TEST_VAR=from-file\n");
        delete process.env.AGENTEQ_TEST_VAR;

        const program = createProgram(registerMcpCommand);

        await program.parseAsync([
            "node",
            "agenteq",
            "mcp",
            "exec",
            "--dotenv",
            join(cwd, ".env"),
            "--",
            process.execPath,
            "-e",
            'require("fs").writeFileSync(process.argv[1], process.argv[2]);',
            outputFile,
            "${AGENTEQ_TEST_VAR}",
        ]);

        await expect(readFile(outputFile, "utf8")).resolves.toBe("from-file");
    });

    it("forwards the real command's exit code", async () => {
        const program = createProgram(registerMcpCommand);

        await program.parseAsync([
            "node",
            "agenteq",
            "mcp",
            "exec",
            "--",
            process.execPath,
            "-e",
            "process.exit(7);",
        ]);

        expect(process.exitCode).toBe(7);
        process.exitCode = 0;
    });
});
