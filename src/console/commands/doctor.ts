import type { Command } from "commander";
import env from "@infrastructure/env.js";
import output from "@infrastructure/terminal/output.js";
import artifactsManager from "@artifacts/services/artifacts-manager/index.js";
import findUninstalledSavedAgentsAction from "@agents/actions/find-uninstalled-saved-agents-action.js";
import findBrokenSymlinksAction from "@artifacts/actions/find-broken-symlinks-action.js";
import findRemoteSourceIssuesAction from "@artifacts/actions/find-remote-source-issues-action.js";
import findTrackedArtifactsAction from "@artifacts/actions/find-tracked-artifacts-action.js";
import { printMessage, renderAsJson } from "@console/utils/console.js";
import type { DoctorFinding } from "@shared/data-transfer-objects/doctor-finding.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Registers `agenteq doctor`.
 * Checks the current project for a configured agent that is no longer installed,
 * a symlink that no longer resolves, a remote source clone that is missing or has drifted,
 * and a generated artifact that ended up tracked by git.
 */
export function registerDoctorCommand(program: Command): void {
    program
        .command("doctor")
        .description(
            "Check the current project for an uninstalled agent, a broken symlink, a missing or drifted remote source clone, and a generated artifact tracked by git",
        )
        .option(
            "--json",
            "print machine-readable JSON instead of text (env: AGENTEQ_JSON)",
        )
        .option(
            "--source-dir <dir>",
            `canonical source directory within the current repository (env: AGENTEQ_SOURCE_DIR, default: ${artifactsManager.DEFAULT_SOURCE_DIR})`,
        )
        .action(async (rawOptions: DoctorOptions) => {
            const isJson = rawOptions.json ?? env.readFlag("AGENTEQ_JSON");

            const sourceDir =
                rawOptions.sourceDir ??
                env.readString("AGENTEQ_SOURCE_DIR") ??
                artifactsManager.DEFAULT_SOURCE_DIR;

            const context = { cwd: process.cwd(), sourceDir: sourceDir };

            const findings = await runChecks(context);

            process.exitCode = findings.length > 0 ? 1 : 0;

            if (isJson) {
                output.writeRaw(renderAsJson(findings));

                return;
            }

            printFindings(findings);
        });
}

/*
 * Interface & Types.
 */

interface DoctorOptions {
    json?: boolean;
    sourceDir?: string;
}

/*
 * Internal.
 */

/**
 * Runs every check independently, so one check's failure never hides another's findings.
 */
async function runChecks(context: RunContext): Promise<DoctorFinding[]> {
    const results = await Promise.all([
        findUninstalledSavedAgentsAction({ context: context }),
        findBrokenSymlinksAction({ context: context }),
        findRemoteSourceIssuesAction({ context: context }),
        findTrackedArtifactsAction({ context: context }),
    ]);

    return results.flat();
}

function printFindings(findings: DoctorFinding[]): void {
    if (findings.length === 0) {
        printMessage({
            isJson: false,
            level: "info",
            message: "No problems found.",
        });

        return;
    }

    for (const finding of findings) {
        output.warn(`${finding.message}\nFix: ${finding.fixCommand}`);
    }
}
