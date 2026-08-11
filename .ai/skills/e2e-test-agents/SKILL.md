---
name: e2e-test-agents

description: Procedural workflow for end-to-end testing every synced agent's output against that agent's real, current config format.
---

# E2E Testing Agent Outputs

## 1. What this verifies

Each file under `src/modules/agents/definitions/` encodes a claim about where and how one real coding agent reads its guidelines, skills, commands, and MCP config. `npm run sandbox` runs a real sync against `examples/basic` and writes the output tree to `.sandbox/`, but nothing in that command checks the output against what the agent itself actually reads. This skill is that check: run the sandbox, read every file it produced, and verify each one against the agent's own current documentation.

## 2. Fixture prerequisites

`examples/basic/.ai/mcp/` needs one source config per MCP server type agenteq supports: `http`, `sse`, and `stdio`. `http` and `sse` both flow through the same `remote` entry mapper, distinguished by the `type` field carried on the server, so keep both fixtures around to exercise that field. Confirm all three exist before running the sandbox. Add a fixture for a new MCP server type whenever one is added.

`examples/basic/.ai/GUIDELINES.md` must live under `.ai/`, not at the example's root. The guidelines sync stage reads `<sourceDir>/GUIDELINES.md`, so a misplaced file silently produces zero guidelines output for every agent, with no error.

## 3. Run the sandbox

Get every agent name from the source of truth, `agentDefinitions` in `src/modules/agents/registry.ts`, rather than from memory, since entries get added over time. Extract the list with `grep -oP '(?<=name: ")[a-z_]+' src/modules/agents/definitions/*.ts`.

Run the sandbox against that full list with `npm run sandbox -- --agents=<comma-separated names>`. This wipes `.sandbox/`, copies `examples/basic` into it, builds the CLI, and runs a real sync with `HOME`/`USERPROFILE` pointed at the sandbox, so even an agent with a home-directory-only config path writes somewhere inspectable.

## 4. Inspect every written file directly

List every file the sandbox produced with `find .sandbox -not -path '*/.git/*' -type f`, then read each one. A `written` status in the sync command's summary table only means the mapper ran without throwing, not that the shape is right, so check the file content itself, per agent.

- Guidelines file. The right path, the source content plus the attribution suffix, no unexpected transformation.
- Skills and commands. The right directory, the expected files present as symlinks, and the expected filename. Most agents keep the source filename, GitHub Copilot renames to `.prompt.md`, check `commandsFileExtension` on the `Agent` definition for any agent that needs a rename.
- MCP config. The right file, the right top-level key (`configKeyPath` on the `Agent`'s `mcp`), and the right per-entry shape for each of the three example servers.

## 5. Cross-examine each agent's output against its real current docs

For each agent, verify against the vendor's own current documentation, WebSearch or WebFetch first, `context7` MCP only for the rare case a CLI tool happens to be indexed there.

1. Is the config file path still current? Vendors rename, relocate, or fold products into others without notice.
2. Is the top-level key, and the per-entry field naming, still correct? Check `command`/`cmd`, `env`/`envs`, `url`/`serverUrl`, and whether a `type` field is present or absent.
3. For an agent with no `mcp:` field despite declaring guidelines or skills, that means its only known MCP config file is global and per-machine with no repo-scoped alternative. Confirm that's still true. A newly added project-local option is a real finding, agenteq should sync into it instead of leaving the agent MCP-unsupported.
4. Is the guidelines filename, and the skills/commands directory convention, still current?

This covers roughly twenty agents and each needs independent research, so split the work across parallel research agents rather than doing it serially. Launch one general-purpose agent per four or five agents, hand each one the exact file paths and content the sandbox produced for those agents in step 4, and ask it to verify each against current docs, tagged CORRECT, WRONG, or UNCERTAIN, with a citation.

## 6. Report

Write findings to `.ai/artifacts/E2E_AGENT_OUTPUT_AUDIT_<date>.md`, following the Artifact management rules in the root guidelines. Structure it with these parts.

- Any cross-cutting bug affecting the sync pipeline itself, not one agent's definition.
- One entry per agent, CORRECT, or the specific WRONG or UNCERTAIN finding, naming the file and field it affects.
- A "Your notes" section at the bottom, left empty, for the person who reads the report.

When a fix lands in the same pass as the audit, mark that entry as fixed rather than leaving it worded as an open finding.

## 7. Related Skills

- **Adding a supported agent**: [add-agent-definition](../add-agent-definition/SKILL.md)
- **Adding a sync capability**: [add-capability-stage](../add-capability-stage/SKILL.md)
- **Writing or updating a test**: [write-tests](../write-tests/SKILL.md)
