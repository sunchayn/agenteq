import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DoctorFinding } from "@shared/data-transfer-objects/doctor-finding.js";

const {
    findUninstalledSavedAgentsMock,
    findBrokenSymlinksMock,
    findRemoteSourceIssuesMock,
    findTrackedArtifactsMock,
} = vi.hoisted(() => ({
    findBrokenSymlinksMock: vi.fn(),
    findRemoteSourceIssuesMock: vi.fn(),
    findTrackedArtifactsMock: vi.fn(),
    findUninstalledSavedAgentsMock: vi.fn(),
}));

vi.mock("@agents/actions/find-uninstalled-saved-agents-action.js", () => ({
    default: findUninstalledSavedAgentsMock,
}));

vi.mock("@artifacts/actions/find-broken-symlinks-action.js", () => ({
    default: findBrokenSymlinksMock,
}));

vi.mock("@artifacts/actions/find-remote-source-issues-action.js", () => ({
    default: findRemoteSourceIssuesMock,
}));

vi.mock("@artifacts/actions/find-tracked-artifacts-action.js", () => ({
    default: findTrackedArtifactsMock,
}));

const { registerDoctorCommand } = await import("@console/commands/doctor.js");

function program(): Command {
    const commandProgram = new Command();

    commandProgram.exitOverride();
    registerDoctorCommand(commandProgram);

    return commandProgram;
}

function readJsonStdout(writeSpy: ReturnType<typeof vi.spyOn>): unknown {
    const written = writeSpy.mock.calls
        .map(([chunk]: [unknown]) => String(chunk))
        .join("");

    return JSON.parse(written);
}

beforeEach(() => {
    findUninstalledSavedAgentsMock.mockReset().mockResolvedValue([]);
    findBrokenSymlinksMock.mockReset().mockResolvedValue([]);
    findRemoteSourceIssuesMock.mockReset().mockResolvedValue([]);
    findTrackedArtifactsMock.mockReset().mockResolvedValue([]);
});

afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
});

describe("agenteq doctor", () => {
    it("exits 0 and reports no problems for a healthy project", async () => {
        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);

        await program().parseAsync(["node", "agenteq", "doctor", "--json"]);

        expect(process.exitCode).toBe(0);
        expect(readJsonStdout(writeSpy)).toEqual([]);
    });

    it("aggregates findings from every check and exits 1", async () => {
        findUninstalledSavedAgentsMock.mockResolvedValue([
            new DoctorFinding({
                fixCommand: "agenteq init",
                message: "agent finding",
            }),
        ]);

        findBrokenSymlinksMock.mockResolvedValue([
            new DoctorFinding({
                fixCommand: "agenteq sync",
                message: "symlink finding",
            }),
        ]);

        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);

        await program().parseAsync(["node", "agenteq", "doctor", "--json"]);

        expect(process.exitCode).toBe(1);

        const payload = readJsonStdout(writeSpy) as {
            message: string;
            fixCommand: string;
        }[];

        expect(payload.map((finding) => finding.message)).toEqual([
            "agent finding",
            "symlink finding",
        ]);
    });
});
