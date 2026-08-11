import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import detectAgentsAction from "@agents/actions/detect-agents-action.js";
import filesystem from "@infrastructure/filesystem.js";
import output from "@infrastructure/terminal/output.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const sandboxDir = join(rootDir, ".sandbox");
const exampleDir = join(rootDir, "examples/basic");

await main();

/*
 * Internal.
 */

async function main(): Promise<void> {
    const { values } = parseArgs({
        options: {
            agents: { type: "string" },
        },
    });

    await filesystem.remove(sandboxDir);
    await filesystem.copy({ source: exampleDir, target: sandboxDir });

    // Without `--agents`, fall back to whatever this machine already has installed,
    // so trying the sandbox with the usual local agents needs no flag at all.
    const agents = values.agents
        ? values.agents.split(",").map((name) => name.trim())
        : (await detectAgentsAction({ cwd: rootDir }))
              .filter((detected) => detected.isSystemInstalled)
              .map((detected) => detected.agent.name);

    // Nothing to sandbox without at least one agent, so this exits instead of running a sync with an empty list.
    if (agents.length === 0) {
        output.error(
            "No agents specified and none detected on this machine. Pass --agents <name,...>.",
        );

        process.exit(1);
    }

    output.info(`Sandbox: ${sandboxDir}`);
    output.info(`Agents: ${agents.join(", ")}`);

    await run("npm", ["run", "build"], rootDir);
    // Some agents may only have a global, "~"-relative config file.
    // Pointing HOME/USERPROFILE at the sandbox keeps those writes contained instead of touching the real user's home directory.
    await run(
        "node",
        [
            join(rootDir, "dist/cli.js"),
            "sync",
            "--agents",
            agents.join(","),
            "--yes",
        ],
        sandboxDir,
        {
            HOME: sandboxDir,
            USERPROFILE: sandboxDir,
        },
    );
}

function run(
    command: string,
    args: string[],
    cwd: string,
    env: Record<string, string> = {},
): Promise<void> {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(command, args, {
            cwd: cwd,
            env: { ...process.env, ...env },
            stdio: "inherit",
        });

        child.on("exit", (code) => {
            if (code === 0) {
                resolvePromise();
            } else {
                reject(
                    new Error(
                        `${command} ${args.join(" ")} exited with code ${code}`,
                    ),
                );
            }
        });
    });
}
