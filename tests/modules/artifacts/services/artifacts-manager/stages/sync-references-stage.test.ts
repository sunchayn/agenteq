import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import syncReferencesStage from "@artifacts/services/artifacts-manager/stages/sync-references-stage.js";
import { REMOTE_REFERENCES_DIR } from "@artifacts/actions/resolve-reference-annotation-action.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import { SyncPayload } from "@artifacts/data-transfer-objects/sync-payload.js";
import type { ResolvedRemoteSource } from "@artifacts/data-transfer-objects/sync-payload.js";
import Agent, { type AgentOptions } from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";

const baseAgentOptions: AgentOptions = {
    detectProjectPathUsing: () => createDetectionConfiguration({}),
    detectSystemPathUsing: () => createDetectionConfiguration({}),
    displayName: "Test Agent",
    name: "test_agent",
};

const testAgent = new Agent(baseAgentOptions);

describe("syncReferencesStage", () => {
    let cwd: string;
    let remoteRoot: string;

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), "agenteq-references-"));
        remoteRoot = await mkdtemp(
            join(tmpdir(), "agenteq-references-remote-"),
        );

        await mkdir(join(cwd, ".ai"), { recursive: true });
    });

    afterEach(async () => {
        await rm(cwd, { force: true, recursive: true });
        await rm(remoteRoot, { force: true, recursive: true });
    });

    function payloadFor(
        remoteSources: ResolvedRemoteSource[] = [],
        isCopyMode = false,
    ): SyncPayload {
        return new SyncPayload({
            capabilities: [AgentCapability.References],
            context: { cwd: cwd, sourceDir: ".ai" },
            isCopyMode: isCopyMode,
            remoteSources: remoteSources,
            selectedAgents: [testAgent],
        });
    }

    it("does nothing when the capability was not requested", async () => {
        const payload = new SyncPayload({
            capabilities: [],
            context: { cwd: cwd, sourceDir: ".ai" },
            selectedAgents: [testAgent],
        });

        const result = await syncReferencesStage(payload);

        expect(result).toBe(payload);
    });

    it("resolves a local annotation found in a skill into the mapping table", async () => {
        await mkdir(join(cwd, ".ai/references/glossary"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/references/glossary/billing.md"),
            "Billing terms.",
        );

        await mkdir(join(cwd, ".ai/skills/billing"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/skills/billing/SKILL.md"),
            "See @reference(glossary/billing.md) for terms.",
        );

        const result = await syncReferencesStage(payloadFor());

        expect(result.remoteSourceWarnings).toEqual([]);
        expect(result.referenceAnnotationTable).toContain(
            ".ai/references/glossary/billing.md",
        );
    });

    it("warns when an annotation cannot be resolved, without throwing", async () => {
        await mkdir(join(cwd, ".ai/references"), { recursive: true });
        await mkdir(join(cwd, ".ai/skills/billing"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/skills/billing/SKILL.md"),
            "See @reference(glossary/missing.md) for terms.",
        );

        const result = await syncReferencesStage(payloadFor());

        expect(result.remoteSourceWarnings).toHaveLength(1);
        expect(result.remoteSourceWarnings[0]).toContain("glossary/missing.md");
        expect(result.referenceAnnotationTable).toContain("unresolved");
    });

    it("mirrors a remote-qualified annotation's target even when not explicitly selected", async () => {
        await mkdir(join(remoteRoot, "glossary/references"), {
            recursive: true,
        });

        await writeFile(
            join(remoteRoot, "glossary/references/billing.md"),
            "Billing terms.",
        );

        await mkdir(join(cwd, ".ai/skills/billing"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/skills/billing/SKILL.md"),
            "See @reference(team:glossary::billing.md) for terms.",
        );

        const result = await syncReferencesStage(
            payloadFor([
                {
                    name: "team",
                    rootDir: remoteRoot,
                    selection: {
                        commands: [],
                        guidelines: false,
                        mcp: [],
                        references: [],
                        skills: [],
                    },
                    url: "git@example.com/team.git",
                },
            ]),
        );

        expect(result.remoteSourceWarnings).toEqual([]);

        const mirrored = await readFile(
            join(cwd, ".ai", REMOTE_REFERENCES_DIR, "team/glossary/billing.md"),
            "utf8",
        );

        expect(mirrored).toBe("Billing terms.");
    });

    it("mirrors a remote reference as a real file copy when copy mode is requested", async () => {
        await mkdir(join(remoteRoot, "glossary/references"), {
            recursive: true,
        });

        await writeFile(
            join(remoteRoot, "glossary/references/billing.md"),
            "Billing terms.",
        );

        await mkdir(join(cwd, ".ai/skills/billing"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/skills/billing/SKILL.md"),
            "See @reference(team:glossary::billing.md) for terms.",
        );

        await syncReferencesStage(
            payloadFor(
                [
                    {
                        name: "team",
                        rootDir: remoteRoot,
                        selection: {
                            commands: [],
                            guidelines: false,
                            mcp: [],
                            references: [],
                            skills: [],
                        },
                        url: "git@example.com/team.git",
                    },
                ],
                true,
            ),
        );

        const target = join(
            cwd,
            ".ai",
            REMOTE_REFERENCES_DIR,
            "team/glossary/billing.md",
        );

        expect((await lstat(target)).isSymbolicLink()).toBe(false);
        expect(await readFile(target, "utf8")).toBe("Billing terms.");
    });
});
