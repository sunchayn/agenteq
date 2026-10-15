---
name: write-tests
description: Test coverage expectations and structure for agenteq's Vitest suite.
---

# Writing Tests

## 1. Test file granularity

Default: one test file per user-facing behavior, not per source file. Mirror the source path under `tests/`. Example: `src/modules/agents/actions/detect-agents-action.ts` pairs with `tests/modules/agents/actions/detect-agents-action.test.ts`.

- Most `actions/`, `services/`, `entities/` files get their own same-named test file.
- Files that exist only to collaborate on one behavior share one test file named for that behavior. Example: sync stages behind `artifactsManager.sync()` go in `artifacts-manager.test.ts`.
- Trivial one-liner: no dedicated test. Cover it through a higher-level test that exercises it.
- `data-transfer-objects/`, `types/`, `definitions/`: may be covered indirectly by the module's higher-level test, if every distinct shape is hit. Add a direct test for a `types/` factory's normalization branch only if no higher-level test exercises it.

## 2. Infrastructure services

`filesystem`, `git`, `shell`, `env`, `terminal/input`, `terminal/output` each keep a dedicated test file. Each wraps a distinct external resource with its own failure modes, so nothing groups them.

## 3. Related Skills

- General TypeScript conventions: [write-typescript-code](../write-typescript-code/SKILL.md)
