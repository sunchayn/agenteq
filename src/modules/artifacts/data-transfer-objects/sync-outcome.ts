import { SyncStatus } from "@artifacts/enums/sync-status.js";
import type { SyncResult } from "../types/sync-result.js";

/**
 * The aggregate outcome of a full sync run.
 */
export class SyncOutcome {
    readonly results: SyncResult[];
    readonly sourceDir: string;
    readonly gitignoreAlerts: string[];

    constructor(options: SyncOutcomeOptions) {
        this.results = options.results;
        this.sourceDir = options.sourceDir;
        this.gitignoreAlerts = options.gitignoreAlerts ?? [];
    }

    get hasFailed(): boolean {
        return this.results.some(
            (result) => result.status === SyncStatus.Failed,
        );
    }
}

/*
 * Interface & Types.
 */

interface SyncOutcomeOptions {
    results: SyncResult[];
    sourceDir: string;
    gitignoreAlerts?: string[];
}
