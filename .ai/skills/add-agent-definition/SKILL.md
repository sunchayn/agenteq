---
name: add-agent-definition
description: Procedural workflow for adding support for a new coding agent to agenteq.
---

# Adding an Agent Definition

## 1. What a definition is

One file in `src/modules/agents/definitions/`, exporting one `new Agent({...})`.

- Capability needing only a path (`guidelinesPath`, `commandsDir`, `skillsDir`): plain string field.
- Capability needing more shape (`mcp`): own configuration object, built with a `create{Name}Configuration` factory.
- Reference: `definitions/claude-code.ts`.

## 2. Steps

1. Create `src/modules/agents/definitions/{name}.ts`, default-exporting one `new Agent({...})`. Why default export: [write-typescript-code](../write-typescript-code/SKILL.md) section 4.
2. Set `name` (snake_case, machine-readable) and `displayName`.
3. Set `detectSystemPathUsing`: closure returning a `DetectionConfiguration` for CLI detection on the system, usually a `command` check.
4. Set `detectProjectPathUsing`: closure returning a `DetectionConfiguration` for detecting the agent in the current project, usually `files` or `paths` checks.
5. Set only capabilities the agent supports: `guidelinesPath`, `commandsDir`, `skillsDir` (string paths), `mcp` (`McpConfiguration` from `createMcpConfiguration`, with `configPath` and `entryMappers`).
6. Register in `src/modules/agents/registry.ts`: one import, one entry in `agentDefinitions`.

No other source file should change. If a sync stage needs touching, a capability abstraction leaks agent-specific logic. Fix the capability configuration, not the stage.

Two files outside the source tree need updating. [refactor-to-agenteq](../refactor-to-agenteq/SKILL.md) and [add-agenteq-to-boost-project](../add-agenteq-to-boost-project/SKILL.md) each hold an identical table of every agent's native guidelines path, skills/commands directory, command file extension, and MCP config path, key path, and entry shape. They run in other repos and cannot read `definitions/{name}.ts`. When adding an agent, or changing any of those fields, update the row in both tables.

## 3. Related Skills

- General TypeScript conventions: [write-typescript-code](../write-typescript-code/SKILL.md)
- Adding a sync capability: [add-capability-stage](../add-capability-stage/SKILL.md)
- Verifying definition output: [e2e-test-agents](../e2e-test-agents/SKILL.md)
- Reverse-engineering tables: [refactor-to-agenteq](../refactor-to-agenteq/SKILL.md), [add-agenteq-to-boost-project](../add-agenteq-to-boost-project/SKILL.md)
