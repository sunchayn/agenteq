import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerDetectCommand } from "@console/commands/detect.js";
import { registerInitCommand } from "@console/commands/init.js";
import { registerSyncCommand } from "@console/commands/sync.js";
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

program.parseAsync().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`agenteq v${pkg.version}: ${message}`);

    // A CliError is an expected, user-facing failure, its message is already the full message.
    // Anything else is an unexpected bug, so its stack trace is worth printing under `--debug`.
    if (
        error instanceof Error &&
        !(error instanceof CliError) &&
        process.env.DEBUG
    ) {
        console.error(error.stack);
    }

    if (pkg.bugs?.url) {
        console.error(
            `If this looks like a bug, please open an issue: ${pkg.bugs.url}`,
        );
    }

    process.exitCode = 1;
});
