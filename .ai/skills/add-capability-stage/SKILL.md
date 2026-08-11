---
name: add-capability-stage

description: Procedural workflow for adding a new sync capability to agenteq's artifacts sync.
---

# Adding a Capability Sync Stage

## 1. How the sync works

`artifactsManager.sync()` builds a `SyncPayload` and pipes it through a fixed, ordered sequence of sync stages, each `async (payload: SyncPayload) => Promise<SyncPayload>`. A stage either returns `payload` unchanged, when its capability wasn't requested, or returns `payload.withResults(...)`. A payload is never mutated in place. `sync()` itself owns assembling and driving that sequence; see `artifacts-manager/index.ts` for the current order.

## 2. Procedural steps

1. Add the capability to `AgentCapability`, `src/modules/artifacts/enums/agent-capability.ts`.
2. If the capability needs nothing beyond a directory or file path, add a bare string field directly on `Agent`, following `commandsDir`/`skillsDir`/`guidelinesPath`. If it needs more shape than a path, add a plain interface under `src/modules/agents/types/`, following `McpConfiguration`'s shape.
3. Write a new sync stage under `src/modules/artifacts/services/artifacts-manager/stages/`, named `sync{Capability}Stage`, default-exported, signature `(payload: SyncPayload) => Promise<SyncPayload>`, guarded by `payload.wantsCapability(...)`.
4. Call it from `artifacts-manager/index.ts`'s `sync()`, threading its returned payload into the next call. `sync()`'s only job is choosing stage order, no capability-specific branching belongs inside it.
5. Default to one dedicated stage per capability. Parameterize a single stage across capabilities only when their logic is structurally identical, not merely similar.

## 3. Related Skills

- **General TypeScript conventions**: [write-typescript-code](../write-typescript-code/SKILL.md)
- **Adding a supported agent**: [add-agent-definition](../add-agent-definition/SKILL.md)
