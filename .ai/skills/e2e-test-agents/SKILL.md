---
name: e2e-test-agents
description: Procedural workflow for end-to-end testing every synced agent's output against that agent's real, current config format.
---

# E2E Testing Agent Outputs

## 1. Purpose

Each file in `src/modules/agents/definitions/` claims where and how one real agent reads its guidelines, skills, commands, and MCP config. `npm run sandbox` runs a real sync against `examples/basic` and writes the output tree to `.sandbox/`. Nothing in it checks that output against what the agent actually reads. This skill is that check: run the sandbox, read every produced file, verify each against the agent's current documentation.

## 2. Fixture prerequisites

- `examples/basic/.ai/mcp/` needs one source config per supported MCP server type: `http`, `sse`, `stdio`. `http` and `sse` share the `remote` entry mapper and differ by the server's `type` field, so keep both. Confirm all three exist before running. Add a fixture whenever a new MCP server type is added.
- `examples/basic/.ai/GUIDELINES.md` must be under `.ai/`, not the example root. The guidelines stage reads `<sourceDir>/GUIDELINES.md`. A misplaced file silently produces zero guidelines output for every agent, with no error.

## 3. Run the sandbox

1. Get agent names from the source of truth, `agentDefinitions` in `src/modules/agents/registry.ts`, not from memory. Extract: `grep -oP '(?<=name: ")[a-z_]+' src/modules/agents/definitions/*.ts`.
2. Run `npm run sandbox -- --agents=<comma-separated names>`. It wipes `.sandbox/`, copies `examples/basic`, builds the CLI, and runs a real sync with `HOME`/`USERPROFILE` pointed at the sandbox. Agents with home-directory-only config paths write somewhere inspectable.

## 4. Inspect every written file

List files: `find .sandbox -not -path '*/.git/*' -type f`. Read each one. A `written` status in the sync summary only means the mapper did not throw, not that the shape is right. Per agent, check:

- Guidelines file: right path, source content plus attribution suffix, no unexpected transformation.
- Skills and commands: right directory, expected files present as symlinks, expected filename. Most agents keep the source filename. GitHub Copilot renames to `.prompt.md`. Check `commandsFileExtension` on the `Agent` definition for renames.
- MCP config: right file, right top-level key (`configKeyPath` on the agent's `mcp`), right per-entry shape for each of the three example servers.

## 5. Cross-check against current vendor docs

Use the vendor's own docs. WebSearch or WebFetch first. `context7` MCP only if the CLI tool is indexed there. Per agent:

1. Is the config file path still current? Vendors rename, move, or merge products without notice.
2. Are the top-level key and per-entry field names still correct? Check `command`/`cmd`, `env`/`envs`, `url`/`serverUrl`, and whether `type` is present.
3. Agent has no `mcp:` field but declares guidelines or skills: its only known MCP config is global and per-machine. Confirm that still holds. A new project-local option is a real finding. Sync into it.
4. Are the guidelines filename and skills/commands directory convention still current?

About twenty agents, each needing separate research. Run parallel research agents, one general-purpose agent per four or five agents. Give each the exact file paths and content the sandbox produced for its agents (step 4). Ask for CORRECT, WRONG, or UNCERTAIN per agent, with a citation.

## 6. Report

Write findings to `.ai/artifacts/E2E_AGENT_OUTPUT_AUDIT_<date>.md`, per the Artifact management rules in the root guidelines. Include:

- Cross-cutting bugs in the sync pipeline itself, not one agent's definition.
- One entry per agent: CORRECT, or the specific WRONG or UNCERTAIN finding, naming the file and field.
- An empty "Your notes" section at the bottom for the reader.

If a fix lands in the same pass, mark that entry fixed, not open.

## 7. Related Skills

- Adding a supported agent: [add-agent-definition](../add-agent-definition/SKILL.md)
- Adding a sync capability: [add-capability-stage](../add-capability-stage/SKILL.md)
- Writing or updating a test: [write-tests](../write-tests/SKILL.md)
