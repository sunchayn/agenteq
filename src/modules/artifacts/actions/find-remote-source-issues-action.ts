import filesystem from "@infrastructure/filesystem.js";
import git from "@infrastructure/git.js";
import { normalizeGitUrl } from "@support/utils/normalize-git-url.js";
import { defaultClonePathFor } from "@support/utils/agenteq-sources-root.js";
import loadAgentsFileAction from "@agents/actions/load-agents-file-action.js";
import loadRemoteSourcesFileAction from "@artifacts/actions/load-remote-sources-file-action.js";
import { DoctorFinding } from "@shared/data-transfer-objects/doctor-finding.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Checks every configured remote source's local clone still exists on disk,
 * and that its origin still matches the URL recorded for it.
 */
export default async function findRemoteSourceIssuesAction(
    options: FindRemoteSourceIssuesOptions,
): Promise<DoctorFinding[]> {
    const { context } = options;

    const remotes = await loadRemoteSourcesFileAction({ context: context });
    const agentsFile = await loadAgentsFileAction({ context: context });

    const findings: DoctorFinding[] = [];

    for (const name of remotes.names()) {
        const entry = remotes.get(name);

        if (!entry) {
            continue;
        }

        const clonePath =
            agentsFile?.clonePathOf(name) ?? defaultClonePathFor(name);

        const finding = await checkOneRemote(name, entry.url, clonePath);

        if (finding) {
            findings.push(finding);
        }
    }

    return findings;
}

/*
 * Interface & Types.
 */

interface FindRemoteSourceIssuesOptions {
    context: RunContext;
}

/*
 * Internal.
 */

async function checkOneRemote(
    name: string,
    recordedUrl: string,
    clonePath: string,
): Promise<DoctorFinding | undefined> {
    if (!(await filesystem.exists(clonePath))) {
        return new DoctorFinding({
            fixCommand: "agenteq sync",
            message: `Remote source "${name}"'s clone at ${clonePath} no longer exists.`,
        });
    }

    const actualUrl = git.remoteUrl({ cwd: clonePath });

    if (
        !actualUrl ||
        normalizeGitUrl(actualUrl) === normalizeGitUrl(recordedUrl)
    ) {
        return undefined;
    }

    return new DoctorFinding({
        fixCommand: `agenteq remote-source remove ${name} && agenteq remote-source add ${name} ${recordedUrl}`,
        message: `Remote source "${name}" at ${clonePath} points to ${actualUrl}, but is configured for ${recordedUrl}.`,
    });
}
