import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import resolveReferenceAnnotationAction, {
    extractReferenceAnnotations,
    parseReferenceAnnotation,
    REMOTE_REFERENCES_DIR,
} from "@artifacts/actions/resolve-reference-annotation-action.js";

describe("extractReferenceAnnotations", () => {
    it("finds every distinct annotation body in a piece of text", () => {
        const content =
            "See @reference(glossary/billing.md) and @reference(backend::glossary/billing.md).";

        expect(extractReferenceAnnotations(content)).toEqual([
            "glossary/billing.md",
            "backend::glossary/billing.md",
        ]);
    });

    it("deduplicates the same annotation used more than once", () => {
        const content =
            "@reference(glossary/billing.md) ... @reference(glossary/billing.md)";

        expect(extractReferenceAnnotations(content)).toEqual([
            "glossary/billing.md",
        ]);
    });

    it("returns an empty list when nothing is annotated", () => {
        expect(extractReferenceAnnotations("no annotations here")).toEqual([]);
    });
});

describe("parseReferenceAnnotation", () => {
    it("parses a bare path as having neither a remote nor a namespace", () => {
        expect(parseReferenceAnnotation("glossary/billing.md")).toEqual({
            path: "glossary/billing.md",
        });
    });

    it("parses a namespaced path as having a namespace but no remote", () => {
        expect(
            parseReferenceAnnotation("backend::glossary/billing.md"),
        ).toEqual({
            namespace: "backend",
            path: "glossary/billing.md",
        });
    });

    it("parses a remote-qualified, namespaced path as having both", () => {
        expect(
            parseReferenceAnnotation("my-org:backend::glossary/billing.md"),
        ).toEqual({
            namespace: "backend",
            path: "glossary/billing.md",
            remote: "my-org",
        });
    });
});

describe("resolveReferenceAnnotationAction", () => {
    let cwd: string;

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), "agenteq-reference-resolve-"));
    });

    afterEach(async () => {
        await rm(cwd, { force: true, recursive: true });
    });

    it("resolves a bare path against the local references directory", async () => {
        await mkdir(join(cwd, ".ai/references/glossary"), { recursive: true });
        await writeFile(join(cwd, ".ai/references/glossary/billing.md"), "hi");

        const resolved = await resolveReferenceAnnotationAction({
            annotation: "glossary/billing.md",
            context: { cwd: cwd, sourceDir: ".ai" },
            remoteNames: [],
        });

        expect(resolved).toBe(".ai/references/glossary/billing.md");
    });

    it("resolves a remote-qualified path against that remote's mirrored copy only", async () => {
        const remoteBillingPath = join(
            ".ai",
            REMOTE_REFERENCES_DIR,
            "team/glossary/billing.md",
        );

        await mkdir(join(cwd, ".ai", REMOTE_REFERENCES_DIR, "team/glossary"), {
            recursive: true,
        });

        await writeFile(join(cwd, remoteBillingPath), "hi");

        const resolved = await resolveReferenceAnnotationAction({
            annotation: "team:glossary::billing.md",
            context: { cwd: cwd, sourceDir: ".ai" },
            remoteNames: ["team"],
        });

        expect(resolved).toBe(remoteBillingPath);
    });

    it("prefers the hint remote's own mirrored copy over the local source", async () => {
        const remoteBillingPath = join(
            ".ai",
            REMOTE_REFERENCES_DIR,
            "team/glossary/billing.md",
        );

        await mkdir(join(cwd, ".ai", REMOTE_REFERENCES_DIR, "team/glossary"), {
            recursive: true,
        });

        await writeFile(join(cwd, remoteBillingPath), "remote");

        await mkdir(join(cwd, ".ai/references/glossary"), { recursive: true });
        await writeFile(
            join(cwd, ".ai/references/glossary/billing.md"),
            "local",
        );

        const resolved = await resolveReferenceAnnotationAction({
            annotation: "glossary::billing.md",
            context: { cwd: cwd, sourceDir: ".ai" },
            hintRemote: "team",
            remoteNames: ["team"],
        });

        expect(resolved).toBe(remoteBillingPath);
    });

    it("returns undefined when nothing on disk matches", async () => {
        const resolved = await resolveReferenceAnnotationAction({
            annotation: "glossary/missing.md",
            context: { cwd: cwd, sourceDir: ".ai" },
            remoteNames: [],
        });

        expect(resolved).toBeUndefined();
    });
});
