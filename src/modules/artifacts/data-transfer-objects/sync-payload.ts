import type Agent from "@agents/entities/agent.js";
import type { RunContext } from "@shared/types/run-context.js";
import type { AgentCapability } from "@artifacts/enums/agent-capability.js";
import type { SyncResult } from "@artifacts/types/sync-result.js";
import type { RemoteSourceSelection } from "@artifacts/entities/remote-sources-file.js";

/**
 * Describes the current state of the payload running through the sync pipeline.
 * The outcome of the sync is added incrementally using this immutable DTO and carried over for next stages.
 */
export class SyncPayload {
    readonly context: RunContext;
    readonly selectedAgents: Agent[];
    readonly capabilities: AgentCapability[];
    readonly results: SyncResult[];
    readonly artifactPaths: string[];
    readonly boostGuidelines?: string;
    readonly remoteSources: ResolvedRemoteSource[];
    readonly remoteSourceWarnings: string[];

    constructor(options: SyncPayloadOptions) {
        this.context = options.context;
        this.selectedAgents = options.selectedAgents;
        this.capabilities = options.capabilities;
        this.results = options.results ?? [];
        this.artifactPaths = options.artifactPaths ?? [];
        this.boostGuidelines = options.boostGuidelines;
        this.remoteSources = options.remoteSources ?? [];
        this.remoteSourceWarnings = options.remoteSourceWarnings ?? [];
    }

    wantsCapability(capability: AgentCapability): boolean {
        return this.capabilities.includes(capability);
    }

    /**
     * Returns a new payload with the given results and artifact paths appended to what was already collected.
     */
    withResults(
        results: SyncResult[],
        artifactPaths: string[] = [],
    ): SyncPayload {
        return new SyncPayload({
            artifactPaths: [...this.artifactPaths, ...artifactPaths],
            boostGuidelines: this.boostGuidelines,
            capabilities: this.capabilities,
            context: this.context,
            remoteSources: this.remoteSources,
            remoteSourceWarnings: this.remoteSourceWarnings,
            results: [...this.results, ...results],
            selectedAgents: this.selectedAgents,
        });
    }

    /**
     * Returns a new payload carrying the guidelines resolved from an existing Laravel Boost installation.
     */
    withBoostGuidelines(boostGuidelines: string | undefined): SyncPayload {
        return new SyncPayload({
            artifactPaths: this.artifactPaths,
            boostGuidelines: boostGuidelines,
            capabilities: this.capabilities,
            context: this.context,
            remoteSources: this.remoteSources,
            remoteSourceWarnings: this.remoteSourceWarnings,
            results: this.results,
            selectedAgents: this.selectedAgents,
        });
    }

    /**
     * Returns a new payload carrying every resolved remote source, in configured order.
     */
    withRemoteSources(remoteSources: ResolvedRemoteSource[]): SyncPayload {
        return new SyncPayload({
            artifactPaths: this.artifactPaths,
            boostGuidelines: this.boostGuidelines,
            capabilities: this.capabilities,
            context: this.context,
            remoteSources: remoteSources,
            remoteSourceWarnings: this.remoteSourceWarnings,
            results: this.results,
            selectedAgents: this.selectedAgents,
        });
    }

    /**
     * Returns a new payload with one more warning about a remote source appended,
     * surfaced to the user through the sync outcome instead of a thrown error.
     */
    withRemoteSourceWarning(warning: string): SyncPayload {
        return new SyncPayload({
            artifactPaths: this.artifactPaths,
            boostGuidelines: this.boostGuidelines,
            capabilities: this.capabilities,
            context: this.context,
            remoteSources: this.remoteSources,
            remoteSourceWarnings: [...this.remoteSourceWarnings, warning],
            results: this.results,
            selectedAgents: this.selectedAgents,
        });
    }
}

/*
 * Interface & Types.
 */

export interface ResolvedRemoteSource {
    name: string;
    rootDir: string;
    url: string;
    selection: RemoteSourceSelection;
}

interface SyncPayloadOptions {
    context: RunContext;
    selectedAgents: Agent[];
    capabilities: AgentCapability[];
    results?: SyncResult[];
    artifactPaths?: string[];
    boostGuidelines?: string;
    remoteSources?: ResolvedRemoteSource[];
    remoteSourceWarnings?: string[];
}
