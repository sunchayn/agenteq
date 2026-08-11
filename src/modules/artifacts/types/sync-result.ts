import type { AgentCapability } from "@artifacts/enums/agent-capability.js";
import type { SyncStatus } from "@artifacts/enums/sync-status.js";

/**
 * Represents what happened when syncing one capability into one agent.
 */
export interface SyncResult {
    agent: string;
    capability: AgentCapability;
    item: string;
    status: SyncStatus;
    /**
     * The caught error's message, set only when status is Failed, so a failure is never just an opaque status with no reason.
     */
    detail?: string;
}
