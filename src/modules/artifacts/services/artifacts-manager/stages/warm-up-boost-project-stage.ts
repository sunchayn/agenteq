import { join } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import git from "@infrastructure/git.js";
import type Agent from "@agents/entities/agent.js";
import resolveBoostAgentsAction from "@agents/actions/resolve-boost-agents-action.js";
import { SyncPayload } from "@artifacts/data-transfer-objects/sync-payload.js";

/**
 * Matches the block Boost rewrites on every install or update.
 * Shared with the hand-edit guard, which skips files Boost owns and rewrites anyway.
 */
export const GUIDELINES_BLOCK_PATTERN =
    /<laravel-boost-guidelines>(.*?)<\/laravel-boost-guidelines>/s;

/**
 * Warm up the project with Laravel Boost when applicable,
 * 1. Pipe in the project guidelines.
 * 2. Git ignore the skills.
 */
export default async function warmUpBoostProjectStage(
    payload: SyncPayload,
): Promise<SyncPayload> {
    const { cwd } = payload.context;

    const raw = await filesystem.readFile(join(cwd, "boost.json"));

    if (!raw) {
        return payload;
    }

    const boostAgents = await resolveBoostAgentsAction({
        context: payload.context,
        fileContent: raw,
    });

    if (!boostAgents) {
        return payload;
    }

    const { isDryRun } = payload.context;

    await gitignoreBoostSkills(cwd, boostAgents, isDryRun);

    return payload.withBoostGuidelines(
        await resolveGuidelines(cwd, boostAgents, isDryRun),
    );
}

/*
 * Internal.
 */

async function resolveGuidelines(
    cwd: string,
    boostAgents: Agent[],
    isDryRun: boolean | undefined,
): Promise<string | undefined> {
    for (const agent of boostAgents) {
        if (agent.guidelinesPath) {
            const guidelines = await extractGuidelines(
                cwd,
                agent.guidelinesPath,
                isDryRun,
            );

            if (guidelines) {
                return guidelines;
            }
        }
    }

    return undefined;
}

async function gitignoreBoostSkills(
    cwd: string,
    boostAgents: Agent[],
    isDryRun: boolean | undefined,
): Promise<void> {
    for (const agent of boostAgents) {
        if (!agent.skillsDir) {
            continue;
        }

        const files = await filesystem.glob({
            cwd: join(cwd, agent.skillsDir),
            onlyFiles: true,
            pattern: "**/*",
        });

        // A dry run only resolves the guidelines block, it never touches .gitignore.
        if (files.length > 0 && !isDryRun) {
            await git.ignore({ cwd: cwd, relPath: agent.skillsDir });
        }
    }
}

async function extractGuidelines(
    cwd: string,
    relGuidelinesPath: string,
    isDryRun: boolean | undefined,
): Promise<string | undefined> {
    const absolutePath = join(cwd, relGuidelinesPath);
    const content = await filesystem.readFile(absolutePath);

    if (!content) {
        return undefined;
    }

    const match = GUIDELINES_BLOCK_PATTERN.exec(content);

    if (!match) {
        return undefined;
    }

    // A dry run only resolves the guidelines block, it never touches .gitignore.
    if (!isDryRun) {
        await git.ignore({ cwd: cwd, relPath: relGuidelinesPath });
    }

    return match[1].trim();
}
