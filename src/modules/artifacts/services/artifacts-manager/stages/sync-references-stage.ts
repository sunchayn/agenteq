import { join } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import git from "@infrastructure/git.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import { SyncStatus } from "@artifacts/enums/sync-status.js";
import type { SyncResult } from "@artifacts/types/sync-result.js";
import { SyncPayload } from "@artifacts/data-transfer-objects/sync-payload.js";
import type { ResolvedRemoteSource } from "@artifacts/data-transfer-objects/sync-payload.js";
import {
    NAMESPACE_SEPARATOR,
    NAMESPACE_WILDCARD_NAME,
} from "@artifacts/actions/discover-remote-capabilities-action.js";
import {
    groupByNamespace,
    mirrorDir,
} from "@artifacts/services/artifacts-manager/stages/sync-symlink-capability-stage.js";
import {
    extractReferenceAnnotations,
    looksLikeFileReference,
    parseReferenceAnnotation,
    REMOTE_REFERENCES_DIR,
} from "@artifacts/actions/resolve-reference-annotation-action.js";
import resolveReferenceAnnotationAction from "@artifacts/actions/resolve-reference-annotation-action.js";
import {
    referenceMappingSuffix,
    type ReferenceAnnotationRow,
} from "@artifacts/services/artifacts-manager/stubs/reference-mapping-suffix.js";

/**
 * Mirrors every remote's selected reference files into its own namespaced mirror folder.
 * Referenced files (in Skills or Guidelines) are always pulled, if exiting, even if not selected explicitly.
 */
export default async function syncReferencesStage(
    payload: SyncPayload,
): Promise<SyncPayload> {
    if (!payload.wantsCapability(AgentCapability.References)) {
        return payload;
    }

    const occurrences = await collectAnnotationOccurrences(payload);

    const hasLocalReferences = await filesystem.exists(
        join(payload.context.cwd, payload.context.sourceDir, "references"),
    );

    if (
        occurrences.length === 0 &&
        !hasLocalReferences &&
        payload.remoteSources.every(
            (remote) => remote.selection.references.length === 0,
        )
    ) {
        return payload;
    }

    const mirrorTargets = buildMirrorTargets(payload, occurrences);

    const { artifactPaths, fileCount } = await mirrorReferences(
        payload,
        mirrorTargets,
    );

    const remoteNames = payload.remoteSources.map((remote) => remote.name);
    const rows: ReferenceAnnotationRow[] = [];

    let result = payload;

    for (const occurrence of occurrences) {
        const parsed = parseReferenceAnnotation(occurrence.annotation);

        // A placeholder like "..." or "<file name>" is a syntax example,
        // not a real reference, so it is skipped entirely, no row, no warning.
        if (!looksLikeFileReference(parsed)) {
            continue;
        }

        const resolvedPath = await resolveReferenceAnnotationAction({
            annotation: occurrence.annotation,
            context: payload.context,
            hintRemote: occurrence.remoteName,
            remoteNames: remoteNames,
        });

        rows.push({
            annotation: occurrence.annotation,
            resolvedPath: resolvedPath,
            sourcePath: occurrence.sourcePath,
        });

        if (!resolvedPath) {
            result = result.withRemoteSourceWarning(
                `Could not resolve reference annotation "@reference(${occurrence.annotation})" used in ${occurrence.sourcePath}.`,
            );
        }
    }

    result = result.withReferenceAnnotationTable(referenceMappingSuffix(rows));

    const results: SyncResult[] = [
        {
            agent: "(shared)",
            capability: AgentCapability.References,
            item: `${fileCount} file(s)`,
            status: SyncStatus.Written,
        },
    ];

    return result.withResults(results, artifactPaths);
}

/*
 * Interface & Types.
 */

interface AnnotationOccurrence {
    sourcePath: string;
    annotation: string;
    remoteName?: string;
}

interface MirrorReferencesResult {
    artifactPaths: string[];
    fileCount: number;
}

/*
 * Internal.
 */

/**
 * Scans all local and remote sources (Skills and Guidelines) for every reference annotation they use.
 */
async function collectAnnotationOccurrences(
    payload: SyncPayload,
): Promise<AnnotationOccurrence[]> {
    const { cwd, sourceDir } = payload.context;
    const occurrences: AnnotationOccurrence[] = [];

    await collectFromLocal(cwd, sourceDir, occurrences);

    for (const remote of payload.remoteSources) {
        await collectFromRemote(remote, occurrences);
    }

    return occurrences;
}

async function collectFromLocal(
    cwd: string,
    sourceDir: string,
    occurrences: AnnotationOccurrence[],
): Promise<void> {
    const guidelinesRelPath = join(sourceDir, "GUIDELINES.md");

    await addOccurrencesFrom(
        join(cwd, guidelinesRelPath),
        guidelinesRelPath,
        undefined,
        occurrences,
    );

    const skillFiles = await filesystem.glob({
        cwd: join(cwd, sourceDir, "skills"),
        onlyFiles: true,
        pattern: "**/*.md",
    });

    for (const file of skillFiles) {
        const relPath = join(sourceDir, "skills", file);

        await addOccurrencesFrom(
            join(cwd, relPath),
            relPath,
            undefined,
            occurrences,
        );
    }
}

async function collectFromRemote(
    remote: ResolvedRemoteSource,
    occurrences: AnnotationOccurrence[],
): Promise<void> {
    await addOccurrencesFrom(
        join(remote.rootDir, "GUIDELINES.md"),
        `${remote.name}/GUIDELINES.md`,
        remote.name,
        occurrences,
    );

    const skillFiles = await filesystem.glob({
        cwd: remote.rootDir,
        onlyFiles: true,
        pattern: "**/skills/**/*.md",
    });

    for (const file of skillFiles) {
        await addOccurrencesFrom(
            join(remote.rootDir, file),
            `${remote.name}/${file}`,
            remote.name,
            occurrences,
        );
    }
}

async function addOccurrencesFrom(
    absolutePath: string,
    sourcePath: string,
    remoteName: string | undefined,
    occurrences: AnnotationOccurrence[],
): Promise<void> {
    const content = await filesystem.readFile(absolutePath);

    if (!content) {
        return;
    }

    for (const annotation of extractReferenceAnnotations(content)) {
        occurrences.push({
            annotation: annotation,
            remoteName: remoteName,
            sourcePath: sourcePath,
        });
    }
}

/**
 * Builds, per remote, the set of namespaced reference identifiers to mirror.
 */
function buildMirrorTargets(
    payload: SyncPayload,
    occurrences: AnnotationOccurrence[],
): Map<string, Set<string>> {
    const targets = new Map<string, Set<string>>();

    for (const remote of payload.remoteSources) {
        targets.set(remote.name, new Set(remote.selection.references));
    }

    for (const occurrence of occurrences) {
        const parsed = parseReferenceAnnotation(occurrence.annotation);
        const targetRemote = parsed.remote ?? occurrence.remoteName;

        if (!targetRemote) {
            continue;
        }

        const identifier = parsed.namespace
            ? `${parsed.namespace}${NAMESPACE_SEPARATOR}${parsed.path}`
            : parsed.path;

        targets.get(targetRemote)?.add(identifier);
    }

    return targets;
}

/**
 * Mirrors every targeted reference file, grouped by namespace, into its remote's own folder.
 */
async function mirrorReferences(
    payload: SyncPayload,
    mirrorTargets: Map<string, Set<string>>,
): Promise<MirrorReferencesResult> {
    const { cwd, isDryRun, sourceDir } = payload.context;
    const { isCopyMode } = payload;
    let fileCount = 0;

    for (const remote of payload.remoteSources) {
        const selection = mirrorTargets.get(remote.name);

        if (!selection || selection.size === 0) {
            continue;
        }

        const byNamespace = groupByNamespace([...selection]);

        for (const [namespace, names] of byNamespace) {
            const { files } = await mirrorDir({
                filterFiles: (file) =>
                    names.includes(NAMESPACE_WILDCARD_NAME) ||
                    names.includes(file),
                isCopyMode: isCopyMode,
                isDryRun: isDryRun,
                sourceDir: join(
                    remote.rootDir,
                    namespace,
                    AgentCapability.References,
                ),
                targetDir: join(
                    cwd,
                    sourceDir,
                    REMOTE_REFERENCES_DIR,
                    remote.name,
                    namespace,
                ),
            });

            fileCount += files.length;
        }
    }

    if (fileCount === 0) {
        return { artifactPaths: [], fileCount: 0 };
    }

    const targetRelDir = join(sourceDir, REMOTE_REFERENCES_DIR);

    // A dry run only reports the file count, it never touches .gitignore.
    if (!isDryRun) {
        await git.ignore({ cwd: cwd, relPath: targetRelDir });
    }

    return { artifactPaths: [targetRelDir], fileCount: fileCount };
}
