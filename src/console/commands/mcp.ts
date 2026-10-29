import { spawn } from "node:child_process";
import type { Command } from "commander";
import filesystem from "@infrastructure/filesystem.js";
import { CliError } from "@support/errors/cli-error.js";
import { parseDotenv } from "@support/utils/parse-dotenv.js";
import { expandEnvPlaceholders } from "@support/utils/expand-env-placeholders.js";
import { expandPath } from "@support/utils/expand-path.js";

/**
 * Registers `agenteq mcp exec`, the runner a synced MCP entry wraps itself in.
 * It resolves ${VAR} placeholders, then execs the real server.
 */
export function registerMcpCommand(program: Command): void {
    const mcpCommand = program
        .command("mcp")
        .description("Utilities the synced MCP entries themselves rely on.");

    mcpCommand
        .command("exec")
        .description(
            "Resolve ${VAR} placeholders from an env file, then exec the real MCP server.",
        )
        .option(
            "--dotenv <path>",
            "env file to read, repeatable, earlier files win a same-key collision",
            collectEnvFiles,
            [],
        )
        .argument("<command...>", "the real server command and its arguments")
        .action(async (commandArgs: string[], options: ExecOptions) => {
            const exitCode = await execMcpServer({
                command: commandArgs,
                envFiles: options.dotenv,
            });

            process.exitCode = exitCode;
        });
}

/*
 * Interface & Types.
 */

interface ExecOptions {
    dotenv: string[];
}

interface ExecMcpServerOptions {
    command: string[];
    envFiles: string[];
}

/*
 * Internal.
 */

function collectEnvFiles(value: string, previous: string[]): string[] {
    return [...previous, value];
}

/**
 * Resolves every ${VAR} placeholder, then execs the real command with stdio passed straight through.
 * A real process env value wins over the env file.
 */
async function execMcpServer(options: ExecMcpServerOptions): Promise<number> {
    const { command, envFiles } = options;
    const [realCommand, ...realArgs] = command;

    if (!realCommand) {
        throw new CliError(
            "E_MISSING_MCP_EXEC_COMMAND",
            "No command given to `agenteq mcp exec`. Pass it after `--`.",
        );
    }

    const fileValues = await readEnvFiles(envFiles);
    const missing = new Set<string>();

    const resolveVar = (name: string): string | undefined => {
        const fromProcess = process.env[name];

        if (fromProcess !== undefined && !looksLikePlaceholder(fromProcess)) {
            return fromProcess;
        }

        return fileValues[name];
    };

    const expandedEnv: Record<string, string> = {};

    for (const [key, value] of Object.entries(process.env)) {
        if (value === undefined) {
            continue;
        }

        const expanded = expandEnvPlaceholders(value, resolveVar);

        expanded.missing.forEach((name) => missing.add(name));
        expandedEnv[key] = expanded.value;
    }

    const expandedArgs = realArgs.map((arg) => {
        const expanded = expandEnvPlaceholders(arg, resolveVar);

        expanded.missing.forEach((name) => missing.add(name));

        return expanded.value;
    });

    if (missing.size > 0) {
        throw new CliError(
            "E_MISSING_MCP_ENV_VAR",
            `Missing value(s) for ${[...missing].join(", ")}. Checked the process environment and: ${envFiles.join(", ") || "(no --dotenv given)"}.`,
        );
    }

    return runCommand(realCommand, expandedArgs, expandedEnv);
}

async function readEnvFiles(paths: string[]): Promise<Record<string, string>> {
    const merged: Record<string, string> = {};

    for (const path of paths) {
        const text = await filesystem.readFile(expandPath(path));

        if (!text) {
            continue;
        }

        for (const [key, value] of Object.entries(parseDotenv(text))) {
            merged[key] ??= value;
        }
    }

    return merged;
}

function looksLikePlaceholder(value: string): boolean {
    return /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(value);
}

function runCommand(
    command: string,
    args: string[],
    env: Record<string, string>,
): Promise<number> {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn(command, args, { env: env, stdio: "inherit" });

        child.on("error", rejectPromise);
        child.on("exit", (code) => {
            resolvePromise(code ?? 1);
        });
    });
}
