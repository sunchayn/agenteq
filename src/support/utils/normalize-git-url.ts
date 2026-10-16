/**
 * Normalizes a git URL for equality comparisons, stripping a trailing ".git" and a trailing slash.
 */
export function normalizeGitUrl(url: string): string {
    return url.replace(/\.git$/, "").replace(/\/$/, "");
}
