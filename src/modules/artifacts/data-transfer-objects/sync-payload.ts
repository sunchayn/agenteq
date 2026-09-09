import type Agent from "@agents/entities/agent.js";
import type { RunContext } from "@shared/types/run-context.js";
import type { AgentCapability } from "@artifacts/enums/agent-capability.js";
import type { SyncResult } from "@artifacts/types/sync-result.js";

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

    constructor(options: SyncPayloadOptions) {
        this.context = options.context;
        this.selectedAgents = options.selectedAgents;
        this.capabilities = options.capabilities;
        this.results = options.results ?? [];
        this.artifactPaths = options.artifactPaths ?? [];
        this.boostGuidelines = options.boostGuidelines;
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
            results: this.results,
            selectedAgents: this.selectedAgents,
        });
    }
}

/*
 * Interface & Types.
 */

interface SyncPayloadOptions {
    context: RunContext;
    selectedAgents: Agent[];
    capabilities: AgentCapability[];
    results?: SyncResult[];
    artifactPaths?: string[];
    boostGuidelines?: string;
}
