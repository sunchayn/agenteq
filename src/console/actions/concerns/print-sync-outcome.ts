import output from "@infrastructure/terminal/output.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import { SyncStatus } from "@artifacts/enums/sync-status.js";
import type { SyncOutcome } from "@artifacts/data-transfer-objects/sync-outcome.js";
import type { SyncResult } from "@artifacts/types/sync-result.js";
import pc from "picocolors";
import { renderAsJson, TableData } from "@console/utils/console.js";

/**
 * Prints a sync run's outcome, as a plain-text table or as JSON.
 */
export function printSyncOutcome(options: PrintSyncOutcomeOptions): void {
    const { isJson, outcome } = options;

    const {
        gitignoreAlerts,
        hasFailed,
        remoteSourceWarnings,
        results,
        skippedCapabilities,
        sourceDir,
    } = outcome;

    if (isJson) {
        output.writeRaw(
            renderAsJson({
                failed: hasFailed,
                gitignoreAlerts: gitignoreAlerts,
                remoteSourceWarnings: remoteSourceWarnings,
                results: results,
                skippedCapabilities: skippedCapabilities,
            }),
        );

        return;
    }

    for (const warning of remoteSourceWarnings) {
        output.warn(warning);
    }

    if (results.length === 0) {
        output.warn(
            `Nothing to sync (no canonical sources found under ${sourceDir}/ or GUIDELINES.md).`,
        );

        printSkippedCapabilitiesNote(skippedCapabilities);
        printOutSyncCompleted();

        return;
    }

    const { headers, rows } = renderAsTable(results);

    output.table(headers, rows);

    printSkippedCapabilitiesNote(skippedCapabilities);

    if (gitignoreAlerts.length > 0) {
        printGitignoreAlert(gitignoreAlerts);
    }

    if (hasFailed) {
        printFailureDetailsForEachResult(results);
        printOutSyncCompletedWithFailure();

        return;
    }

    printOutSyncCompleted();
}

function printOutSyncCompleted(): void {
    output.outro("Sync complete.");
}

function printOutSyncCompletedWithFailure(): void {
    output.outro("Sync finished with failures.");
}

/**
 * Prints every capability this run skipped, since it wasn't requested.
 */
function printSkippedCapabilitiesNote(skipped: AgentCapability[]): void {
    if (skipped.length === 0) {
        return;
    }

    const list = skipped.join(", ");

    output.warn(
        `Skipped sync for non configured capabilities: ${pc.bold(list)}.`,
    );

    output.info(
        `Run \`init\` or pass \`--only {capabilities}\` to update the list of capabilities.`,
    );
}

/**
 * Warns that some paths agenteq just started git ignoring were already tracked by git,
 * and provides the needed git command to untrack them from the remote origin.
 */
function printGitignoreAlert(gitignoreAlerts: string[]): void {
    const command = pc.bold(`git rm -r --cached ${gitignoreAlerts.join(" ")}`);

    output.warn(
        `agenteq creates artifacts per agent automatically.\n` +
            `Some files were already tracked by git, so remove them from tracking, then commit that removal:\n\n${command}`,
    );
}

/*
 * Interface & Types.
 */

interface PrintSyncOutcomeOptions {
    outcome: SyncOutcome;
    isJson?: boolean;
}

/*
 * Internal.
 */

function renderAsTable(results: SyncResult[]): TableData {
    return {
        headers: ["Agent", "Capability", "Item", "Status"],
        rows: results.map((result) => [
            result.agent,
            result.capability,
            result.item,
            result.status,
        ]),
    };
}

function printFailureDetailsForEachResult(results: SyncResult[]): void {
    for (const result of results) {
        if (result.status !== SyncStatus.Failed || !result.detail) {
            continue;
        }

        output.warn(`${result.agent} (${result.capability}): ${result.detail}`);
    }
}
