import { afterEach, describe, expect, it, vi } from "vitest";
import { printSyncOutcome } from "@console/actions/concerns/print-sync-outcome.js";
import output from "@infrastructure/terminal/output.js";
import { SyncOutcome } from "@artifacts/data-transfer-objects/sync-outcome.js";
import type { SyncResult } from "@artifacts/types/sync-result.js";
import { AgentCapability } from "@artifacts/enums/agent-capability.js";
import { SyncStatus } from "@artifacts/enums/sync-status.js";

afterEach(() => {
    vi.restoreAllMocks();
});

function row(status: SyncStatus, detail?: string): SyncResult {
    return {
        agent: "claude_code",
        capability: AgentCapability.Mcp,
        detail: detail,
        item: "example",
        status: status,
    };
}

describe("printSyncOutcome: json", () => {
    it("writes the outcome as JSON instead of rendering a table", () => {
        const writeSpy = vi
            .spyOn(output, "writeRaw")
            .mockImplementation(() => undefined);

        const outcome = new SyncOutcome({
            requestedCapabilities: Object.values(AgentCapability),
            results: [row(SyncStatus.Written)],
            sourceDir: ".ai",
        });

        printSyncOutcome({ isJson: true, outcome: outcome });

        expect(writeSpy).toHaveBeenCalledTimes(1);

        const payload = JSON.parse(writeSpy.mock.calls[0]?.[0] ?? "") as {
            failed: boolean;
            gitignoreAlerts: string[];
            results: unknown[];
        };

        expect(payload.failed).toBe(false);
        expect(payload.results).toHaveLength(1);
    });
});

describe("printSyncOutcome: nothing to sync", () => {
    it("warns and prints a success outro when there are no results", () => {
        const warnSpy = vi
            .spyOn(output, "warn")
            .mockImplementation(() => undefined);

        const outroSpy = vi
            .spyOn(output, "outro")
            .mockImplementation(() => undefined);

        printSyncOutcome({
            outcome: new SyncOutcome({
                requestedCapabilities: Object.values(AgentCapability),
                results: [],
                sourceDir: ".ai",
            }),
        });

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("Nothing to sync"),
        );

        expect(outroSpy).toHaveBeenCalledWith("Sync complete.");
    });
});

describe("printSyncOutcome: table rendering", () => {
    it("prints a table and a success outro for a fully successful run", () => {
        const tableSpy = vi
            .spyOn(output, "table")
            .mockImplementation(() => undefined);

        const outroSpy = vi
            .spyOn(output, "outro")
            .mockImplementation(() => undefined);

        printSyncOutcome({
            outcome: new SyncOutcome({
                requestedCapabilities: Object.values(AgentCapability),
                results: [row(SyncStatus.Written)],
                sourceDir: ".ai",
            }),
        });

        expect(tableSpy).toHaveBeenCalledWith(
            ["Agent", "Capability", "Item", "Status"],
            [["claude_code", "mcp", "example", "written"]],
        );

        expect(outroSpy).toHaveBeenCalledWith("Sync complete.");
    });
});

describe("printSyncOutcome: gitignore alerts", () => {
    it("warns with the untrack command when paths were newly gitignored", () => {
        vi.spyOn(output, "table").mockImplementation(() => undefined);
        vi.spyOn(output, "outro").mockImplementation(() => undefined);

        const warnSpy = vi
            .spyOn(output, "warn")
            .mockImplementation(() => undefined);

        printSyncOutcome({
            outcome: new SyncOutcome({
                requestedCapabilities: Object.values(AgentCapability),
                gitignoreAlerts: [".ai/agenteq.json"],
                results: [row(SyncStatus.Written)],
                sourceDir: ".ai",
            }),
        });

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("git rm -r --cached .ai/agenteq.json"),
        );
    });
});

describe("printSyncOutcome: remote source warnings", () => {
    it("warns with each remote source warning before rendering the table", () => {
        vi.spyOn(output, "table").mockImplementation(() => undefined);
        vi.spyOn(output, "outro").mockImplementation(() => undefined);

        const warnSpy = vi
            .spyOn(output, "warn")
            .mockImplementation(() => undefined);

        printSyncOutcome({
            outcome: new SyncOutcome({
                requestedCapabilities: Object.values(AgentCapability),
                remoteSourceWarnings: ["Could not pull the remote source"],
                results: [row(SyncStatus.Written)],
                sourceDir: ".ai",
            }),
        });

        expect(warnSpy).toHaveBeenCalledWith(
            "Could not pull the remote source",
        );
    });

    it("includes remote source warnings in the JSON payload", () => {
        const writeSpy = vi
            .spyOn(output, "writeRaw")
            .mockImplementation(() => undefined);

        printSyncOutcome({
            isJson: true,
            outcome: new SyncOutcome({
                requestedCapabilities: Object.values(AgentCapability),
                remoteSourceWarnings: ["Could not pull the remote source"],
                results: [row(SyncStatus.Written)],
                sourceDir: ".ai",
            }),
        });

        const payload = JSON.parse(writeSpy.mock.calls[0]?.[0] ?? "") as {
            remoteSourceWarnings: string[];
        };

        expect(payload.remoteSourceWarnings).toEqual([
            "Could not pull the remote source",
        ]);
    });
});

describe("printSyncOutcome: anyFailed", () => {
    it("prints a failure outro when any result failed", () => {
        vi.spyOn(output, "table").mockImplementation(() => undefined);

        const outroSpy = vi
            .spyOn(output, "outro")
            .mockImplementation(() => undefined);

        printSyncOutcome({
            outcome: new SyncOutcome({
                requestedCapabilities: Object.values(AgentCapability),
                results: [row(SyncStatus.Failed)],
                sourceDir: ".ai",
            }),
        });

        expect(outroSpy).toHaveBeenCalledWith("Sync finished with failures.");
    });

    it("warns with the failed row's caught error message", () => {
        vi.spyOn(output, "table").mockImplementation(() => undefined);
        vi.spyOn(output, "outro").mockImplementation(() => undefined);

        const warnSpy = vi
            .spyOn(output, "warn")
            .mockImplementation(() => undefined);

        printSyncOutcome({
            outcome: new SyncOutcome({
                requestedCapabilities: Object.values(AgentCapability),
                results: [row(SyncStatus.Failed, "Permission denied")],
                sourceDir: ".ai",
            }),
        });

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("Permission denied"),
        );
    });
});

describe("printSyncOutcome: skipped capabilities", () => {
    it("notes every capability not requested this run, after the table", () => {
        vi.spyOn(output, "table").mockImplementation(() => undefined);
        vi.spyOn(output, "outro").mockImplementation(() => undefined);

        const warnSpy = vi
            .spyOn(output, "warn")
            .mockImplementation(() => undefined);

        const infoSpy = vi
            .spyOn(output, "info")
            .mockImplementation(() => undefined);

        printSyncOutcome({
            outcome: new SyncOutcome({
                requestedCapabilities: [AgentCapability.Mcp],
                results: [row(SyncStatus.Written)],
                sourceDir: ".ai",
            }),
        });

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("commands, skills, guidelines"),
        );

        expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("--only"));
    });

    it("says nothing when every capability was requested", () => {
        vi.spyOn(output, "table").mockImplementation(() => undefined);
        vi.spyOn(output, "outro").mockImplementation(() => undefined);

        const warnSpy = vi
            .spyOn(output, "warn")
            .mockImplementation(() => undefined);

        printSyncOutcome({
            outcome: new SyncOutcome({
                requestedCapabilities: Object.values(AgentCapability),
                results: [row(SyncStatus.Written)],
                sourceDir: ".ai",
            }),
        });

        expect(warnSpy).not.toHaveBeenCalled();
    });

    it("still notes skipped capabilities when there was nothing to sync", () => {
        const warnSpy = vi
            .spyOn(output, "warn")
            .mockImplementation(() => undefined);

        vi.spyOn(output, "outro").mockImplementation(() => undefined);

        printSyncOutcome({
            outcome: new SyncOutcome({
                requestedCapabilities: [AgentCapability.Guidelines],
                results: [],
                sourceDir: ".ai",
            }),
        });

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("mcp, commands, skills"),
        );
    });

    it("includes skippedCapabilities in the JSON payload", () => {
        const writeSpy = vi
            .spyOn(output, "writeRaw")
            .mockImplementation(() => undefined);

        printSyncOutcome({
            isJson: true,
            outcome: new SyncOutcome({
                requestedCapabilities: [AgentCapability.Mcp],
                results: [row(SyncStatus.Written)],
                sourceDir: ".ai",
            }),
        });

        const payload = JSON.parse(writeSpy.mock.calls[0]?.[0] ?? "") as {
            skippedCapabilities: string[];
        };

        expect(payload.skippedCapabilities).toEqual([
            "commands",
            "skills",
            "guidelines",
        ]);
    });
});
