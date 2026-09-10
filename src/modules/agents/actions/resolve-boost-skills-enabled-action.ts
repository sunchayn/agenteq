import { join } from "node:path";
import { z } from "zod";
import filesystem from "@infrastructure/filesystem.js";
import type { RunContext } from "@shared/types/run-context.js";

/**
 * Reads Laravel Boost's own `boost.json` and reports whether Boost manages any skills.
 * Boost owns `.ai/skills` when this is true, so agenteq's own skills capability should default to off.
 */
export default async function resolveBoostSkillsEnabledAction(
    options: ResolveBoostSkillsEnabledOptions,
): Promise<boolean> {
    const { context } = options;

    const fileContent =
        options.fileContent ??
        (await filesystem.readFile(join(context.cwd, "boost.json")));

    if (!fileContent) {
        return false;
    }

    let parsed: unknown;

    try {
        parsed = JSON.parse(fileContent);
    } catch {
        return false;
    }

    const result = boostConfigSchema.safeParse(parsed);

    return result.success && result.data.skills.length > 0;
}

/*
 * Interface & Types.
 */

interface ResolveBoostSkillsEnabledOptions {
    context: RunContext;
    fileContent?: string;
}

/*
 * Internal.
 */

const boostConfigSchema = z.object({
    skills: z.array(z.string()).default([]),
});
