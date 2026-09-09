import { join } from "node:path";
import filesystem from "@infrastructure/filesystem.js";
import git from "@infrastructure/git.js";
import type Agent from "@agents/entities/agent.js";
import resolveBoostAgentsAction from "@agents/actions/resolve-boost-agents-action.js";
import { SyncPayload } from "@artifacts/data-transfer-objects/sync-payload.js";

const GUIDELINES_BLOCK_PATTERN =
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

    await gitignoreBoostSkills(cwd, boostAgents);

    return payload.withBoostGuidelines(
        await resolveGuidelines(cwd, boostAgents),
    );
}

/*
 * Internal.
 */

async function resolveGuidelines(
    cwd: string,
    boostAgents: Agent[],
): Promise<string | undefined> {
    for (const agent of boostAgents) {
        if (agent.guidelinesPath) {
            const guidelines = await extractGuidelines(
                cwd,
                agent.guidelinesPath,
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

        if (files.length > 0) {
            await git.ignore({ cwd: cwd, relPath: agent.skillsDir });
        }
    }
}

async function extractGuidelines(
    cwd: string,
    relGuidelinesPath: string,
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

    await git.ignore({ cwd: cwd, relPath: relGuidelinesPath });

    return match[1].trim();
}
