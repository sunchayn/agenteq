import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pc from "picocolors";
import { registerDetectCommand } from "@console/commands/detect.js";
import { registerInitCommand } from "@console/commands/init.js";
import { registerSyncCommand } from "@console/commands/sync.js";
import { registerRemoteSourceCommand } from "@console/commands/remote-source.js";
import { CliError } from "@support/errors/cli-error.js";

const pkg = JSON.parse(
    readFileSync(
        fileURLToPath(new URL("../package.json", import.meta.url)),
        "utf-8",
    ),
) as {
    version: string;
    description: string;
    bugs?: { url?: string };
    homepage?: string;
};

const program = new Command();

program
    .name("agenteq")
    .description(pkg.description)
    .version(pkg.version)
    .option(
        "--debug",
        "print verbose diagnostics to stderr (env: DEBUG=agenteq)",
    )
    .hook("preAction", (thisCommand) => {
        if (thisCommand.opts().debug) {
            process.env.DEBUG = "agenteq";
        }
    });

registerDetectCommand(program);
registerInitCommand(program);
registerSyncCommand(program);
registerRemoteSourceCommand(program);

program.parseAsync().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    console.error(
        `${pc.dim(`agenteq v${pkg.version}:`)} ${pc.red(colorizeErrorCode(message))}`,
    );

    // A CliError is an expected, user-facing failure, its message is already the full message.
    // Anything else is an unexpected bug, so its stack trace is worth printing under `--debug`.
    if (
        error instanceof Error &&
        !(error instanceof CliError) &&
        process.env.DEBUG
    ) {
        console.error(pc.dim(error.stack));
    }

    if (error instanceof CliError && pkg.homepage) {
        console.info(
            `\nCheck the error codes first: ${pkg.homepage}#error-codes`,
        );
    }

    if (pkg.bugs?.url) {
        console.info(
            pc.dim(
                `If this looks like a bug, please open an issue: ${pkg.bugs.url}`,
            ),
        );
    }

    process.exitCode = 1;
});

/**
 * Bolds a leading `(E_CODE)` prefix, so it stands out from the sentence describing it.
 */
function colorizeErrorCode(message: string): string {
    return message.replace(/^\(([A-Z_]+)\)/, (_match, code: string) =>
        pc.bold(`(${code})`),
    );
}
