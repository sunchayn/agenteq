/**
 * What happened when syncing one item into one agent, shared by every sync capability (mcp, commands, skills, guidelines).
 */
export enum SyncStatus {
    Written = "written",
    Skipped = "skipped",
    Removed = "removed",
    Unsupported = "unsupported",
    Failed = "failed",
}
