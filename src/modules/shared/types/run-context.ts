/**
 * The system context where the command is running.
 */
export interface RunContext {
    cwd: string;
    /**
     * The canonical source directory, `.ai` by default.
     */
    sourceDir: string;
    /**
     * Resolves and reports what a sync would do without writing an artifact or `.gitignore` to disk.
     */
    isDryRun?: boolean;
}
