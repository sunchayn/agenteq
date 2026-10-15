---
name: add-capability-stage
description: Procedural workflow for adding a new sync capability to agenteq's artifacts sync.
---

# Adding a Capability Sync Stage

## 1. How sync works

`artifactsManager.sync()` builds a `SyncPayload` and pipes it through ordered stages, each `async (payload: SyncPayload) => Promise<SyncPayload>`.

- Capability not requested: stage returns `payload` unchanged.
- Otherwise: stage returns `payload.withResults(...)`.
- Never mutate a payload in place.
- `sync()` owns stage order. See `artifacts-manager/index.ts`.

## 2. Steps

1. Add the capability to `AgentCapability` in `src/modules/artifacts/enums/agent-capability.ts`.
2. Capability needs only a directory or file path: add a string field on `Agent`, like `commandsDir`/`skillsDir`/`guidelinesPath`. Needs more shape: add a plain interface under `src/modules/agents/types/`, like `McpConfiguration`.
3. Add stage in `src/modules/artifacts/services/artifacts-manager/stages/`. Name `sync{Capability}Stage`. Default export. Signature `(payload: SyncPayload) => Promise<SyncPayload>`. Guard with `payload.wantsCapability(...)`.
4. Call from `sync()` in `artifacts-manager/index.ts`. Pass returned payload to next call. `sync()` only orders stages. No capability branching inside.
5. One stage per capability. Share one stage across capabilities only if logic is structurally identical, not merely similar.

## 3. Related Skills

- General TypeScript conventions: [write-typescript-code](../write-typescript-code/SKILL.md)
- Adding a supported agent: [add-agent-definition](../add-agent-definition/SKILL.md)
