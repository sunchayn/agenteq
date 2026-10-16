import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import { SyncStatus } from "@artifacts/enums/sync-status.js";
import type { SyncResult } from "@artifacts/types/sync-result.js";

/**
 * The aggregate outcome of a full sync run.
 */
export class SyncOutcome {
    readonly results: SyncResult[];
    readonly sourceDir: string;
    readonly gitignoreAlerts: string[];
    readonly remoteSourceWarnings: string[];
    readonly requestedCapabilities: AgentCapability[];
    readonly commentsStrippedPaths: string[];

    constructor(options: SyncOutcomeOptions) {
        this.results = options.results;
        this.sourceDir = options.sourceDir;
        this.gitignoreAlerts = options.gitignoreAlerts ?? [];
        this.remoteSourceWarnings = options.remoteSourceWarnings ?? [];
        this.requestedCapabilities = options.requestedCapabilities;
        this.commentsStrippedPaths = options.commentsStrippedPaths ?? [];
    }

    get hasFailed(): boolean {
        return this.results.some(
            (result) => result.status === SyncStatus.Failed,
        );
    }

    get skippedCapabilities(): AgentCapability[] {
        return Object.values(AgentCapability).filter(
            (capability) => !this.requestedCapabilities.includes(capability),
        );
    }

    /**
     * Returns a new outcome with its remote source warnings replaced, everything else kept as-is.
     */
    withRemoteSourceWarnings(remoteSourceWarnings: string[]): SyncOutcome {
        return new SyncOutcome({
            commentsStrippedPaths: this.commentsStrippedPaths,
            gitignoreAlerts: this.gitignoreAlerts,
            remoteSourceWarnings: remoteSourceWarnings,
            requestedCapabilities: this.requestedCapabilities,
            results: this.results,
            sourceDir: this.sourceDir,
        });
    }
}

/*
 * Interface & Types.
 */

interface SyncOutcomeOptions {
    results: SyncResult[];
    sourceDir: string;
    requestedCapabilities: AgentCapability[];
    gitignoreAlerts?: string[];
    remoteSourceWarnings?: string[];
    commentsStrippedPaths?: string[];
}
