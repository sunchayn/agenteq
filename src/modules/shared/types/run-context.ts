/**
 * The system context where the command is running.
 */
export interface RunContext {
    cwd: string;
    /**
     * The canonical source directory, `.ai` by default.
     */
    sourceDir: string;
}
