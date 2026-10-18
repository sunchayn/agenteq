import { join } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import type { RunContext } from "@shared/types/run-context.js";
import { NAMESPACE_SEPARATOR } from "@artifacts/actions/discover-remote-capabilities-action.js";

/**
 * Pattern matching one "@reference(...)" annotation, capturing its body.
 */
const REFERENCE_ANNOTATION_PATTERN = /@reference\(([^)]+)\)/g;

/**
 * Where every remote source's mirrored reference files land, relative to the source dir.
 */
export const REMOTE_REFERENCES_DIR = "agenteq/remote-references";

/**
 * Finds every "@reference(...)" annotation body in a piece of text, deduplicated.
 */
export function extractReferenceAnnotations(content: string): string[] {
    const bodies = [...content.matchAll(REFERENCE_ANNOTATION_PATTERN)].map(
        (match) => match[1].trim(),
    );

    return [...new Set(bodies)];
}

/**
 * Splits an annotation body into its remote, namespace, and path parts.
 */
export function parseReferenceAnnotation(
    annotation: string,
): ParsedReferenceAnnotation {
    const separatorIndex = annotation.indexOf(NAMESPACE_SEPARATOR);

    if (separatorIndex === -1) {
        return { path: annotation };
    }

    const prefix = annotation.slice(0, separatorIndex);
    const path = annotation.slice(separatorIndex + NAMESPACE_SEPARATOR.length);
    const remoteSeparatorIndex = prefix.indexOf(":");

    if (remoteSeparatorIndex === -1) {
        return { namespace: prefix, path: path };
    }

    return {
        namespace: prefix.slice(remoteSeparatorIndex + 1),
        path: path,
        remote: prefix.slice(0, remoteSeparatorIndex),
    };
}

/**
 * Resolves one "@reference(...)" annotation to the real relative path Agenteq synced it under.
 * Returns undefined when nothing on disk matches.
 */
export default async function resolveReferenceAnnotationAction(
    options: ResolveReferenceAnnotationOptions,
): Promise<string | undefined> {
    const { annotation, context, hintRemote, remoteNames } = options;

    const parsed = parseReferenceAnnotation(annotation);

    const candidates = candidatePaths(parsed, context, hintRemote, remoteNames);

    for (const candidate of candidates) {
        if (await filesystem.exists(join(context.cwd, candidate))) {
            return candidate;
        }
    }

    return undefined;
}

/*
 * Interface & Types.
 */

export interface ParsedReferenceAnnotation {
    remote?: string;
    namespace?: string;
    path: string;
}

export interface ResolveReferenceAnnotationOptions {
    annotation: string;
    context: RunContext;
    /**
     * The remote the annotation was found in, if any.
     * Preferred first when the annotation itself names no remote.
     */
    hintRemote?: string;
    remoteNames: string[];
}

/*
 * Internal.
 */

/**
 * Get candidate paths that might have been the target of a refrecne annotation.
 */
function candidatePaths(
    parsed: ParsedReferenceAnnotation,
    context: RunContext,
    hintRemote: string | undefined,
    remoteNames: string[],
): string[] {
    const { namespace, path, remote } = parsed;

    // A remote-qualified annotation resolves only against that remote's mirrored copy.
    if (remote) {
        return [remotePath(context, remote, namespace, path)];
    }

    const localCandidate = join(
        context.sourceDir,
        "references",
        namespace ?? "",
        path,
    );

    const otherRemotes = remoteNames.filter((name) => name !== hintRemote);

    const remoteCandidates = otherRemotes.map((name) =>
        remotePath(context, name, namespace, path),
    );

    if (!hintRemote) {
        return [localCandidate, ...remoteCandidates];
    }

    // An unqualified one prefers the hint remote, then local, then every other configured remote, in order.
    return [
        remotePath(context, hintRemote, namespace, path),
        localCandidate,
        ...remoteCandidates,
    ];
}

function remotePath(
    context: RunContext,
    remote: string,
    namespace: string | undefined,
    path: string,
): string {
    return join(
        context.sourceDir,
        REMOTE_REFERENCES_DIR,
        remote,
        namespace ?? "",
        path,
    );
}
