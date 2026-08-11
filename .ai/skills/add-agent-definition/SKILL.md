---
name: add-agent-definition

description: Procedural workflow for adding support for a new coding agent to agenteq.
---

# Adding an Agent Definition

## 1. What an agent definition is

One file under `src/modules/agents/definitions/`, exporting a single `new Agent({...})`. A capability that needs nothing beyond a directory or file path, `guidelinesPath`, `commandsDir`, `skillsDir`, is a bare string field. A capability with more shape to configure, `mcp`, gets its own configuration object, built with a `create{Name}Configuration` factory. `definitions/claude-code.ts` is a filled-in reference for this shape.

## 2. Procedural steps

1. Create `src/modules/agents/definitions/{name}.ts`, default-exporting one `new Agent({...})`. See [write-typescript-code](../write-typescript-code/SKILL.md) section 4 for why this is a default export.
2. Set `name` (machine-readable, snake_case) and `displayName` (human-readable).
3. Set `detectSystemPathUsing`, a closure returning a `DetectionConfiguration` for how the agent's CLI is detected on the system, usually a `command` check.
4. Set `detectProjectPathUsing`, a closure returning a `DetectionConfiguration` for how the agent is detected as already configured in the current project, usually `files` or `paths` checks.
5. Opt into only the capabilities the agent actually supports: `guidelinesPath`, `commandsDir`, `skillsDir` (a plain string path each), `mcp` (a `McpConfiguration` built with `createMcpConfiguration`, taking a `configPath` and `entryMappers`).
6. Register it in `src/modules/agents/registry.ts`: one import, one entry added to the exported `agentDefinitions` array.

No other file should need to change. If adding an agent requires touching a sync stage, that's a sign a capability abstraction is leaking agent-specific logic. Reconsider the capability configuration instead of special-casing the new agent inside a stage.

## 3. Related Skills

- **General TypeScript conventions**: [write-typescript-code](../write-typescript-code/SKILL.md)
- **Adding a sync capability**: [add-capability-stage](../add-capability-stage/SKILL.md)
- **Verifying the new definition's output**: [e2e-test-agents](../e2e-test-agents/SKILL.md)
