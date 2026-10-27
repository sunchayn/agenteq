// x-release-please-start-version
const AGENTEQ_VERSION = "1.6.1";
// x-release-please-end

/**
 * Resolves agenteq's own installed version.
 * Kept as a plain constant, release-please bumps it alongside package.json.
 */
export function agenteqPackageVersion(): string {
    return AGENTEQ_VERSION;
}
