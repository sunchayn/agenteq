/**
 * Builds the table appended to the guidelines file.
 * Maps every "@reference(...)" annotation found in a skill or guidelines file to the real path it resolved to.
 * An annotation nothing could resolve is listed as unresolved, instead of being silently dropped.
 */
export function referenceMappingSuffix(rows: ReferenceAnnotationRow[]): string {
    if (rows.length === 0) {
        return "";
    }

    const body = rows
        .map(
            (row) =>
                `| ${row.sourcePath} | \`@reference(${row.annotation})\` | ${row.resolvedPath ?? "unresolved"} |`,
        )
        .join("\n");

    return `
## Reference Annotations

| Source | Annotation | Resolved Path |
| --- | --- | --- |
${body}
`;
}

/*
 * Interface & Types.
 */

export interface ReferenceAnnotationRow {
    sourcePath: string;
    annotation: string;
    resolvedPath?: string;
}
