import { describe, expect, it } from "vitest";
import resolveAgentsByNameAction from "@agents/actions/resolve-agents-by-name-action.js";
import { agentDefinitions } from "@agents/registry.js";
import { CliError } from "@support/errors/cli-error.js";

describe("resolveAgentsByNameAction", () => {
    it("resolves each name to its registered Agent, preserving order", () => {
        const first = agentDefinitions.find((a) => a.name === "claude_code");
        const second = agentDefinitions.find((a) => a.name === "cursor");

        expect(resolveAgentsByNameAction(["cursor", "claude_code"])).toEqual([
            second,
            first,
        ]);
    });

    it("throws E_UNKNOWN_AGENT for a name that isn't registered", () => {
        expect(() =>
            resolveAgentsByNameAction(["definitely-not-a-real-agent"]),
        ).toThrow(CliError);
    });
});
