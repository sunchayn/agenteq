const PLACEHOLDER_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * Replaces every ${VAR} occurrence in a string using the given resolver.
 * An unresolved name is left as-is in the returned value.
 * It is also reported in `missing`, so a caller can fail fast naming it.
 */
export function expandEnvPlaceholders(
    template: string,
    resolveVar: (name: string) => string | undefined,
): { value: string; missing: string[] } {
    const missing = new Set<string>();

    const value = template.replace(
        PLACEHOLDER_PATTERN,
        (match, name: string) => {
            const resolved = resolveVar(name);

            if (resolved === undefined) {
                missing.add(name);

                return match;
            }

            return resolved;
        },
    );

    return { missing: [...missing], value: value };
}
