import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The default root every remote source is cloned under, unless overridden with `--path`.
 * Shared so sync can always reconcile symlinks against it, even once a remote source is removed,
 * or swapped for a different one, and is no longer known to the payload.
 */
export const AGENTEQ_SOURCES_ROOT = join(homedir(), ".agenteq", "sources");
