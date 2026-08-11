---
name: write-tests

description: Test coverage expectations and structure for agenteq's Vitest suite.
---

# Writing Tests

## 1. Test file granularity

Default: one test file per user-facing behavior, not one per source file, mirrored under `tests/` (for example `src/modules/agents/actions/detect-agents-action.ts` pairs with `tests/modules/agents/actions/detect-agents-action.test.ts`).

- Most `actions/`, `services/`, and `entities/` files stand on their own and get their own same-named test file.
- Group several small files into one test file, named for the shared behavior or module, when they exist only to collaborate on one behavior, for example the sync stages behind `artifactsManager.sync()` grouped under `artifacts-manager.test.ts`.
- A trivial one-liner needs no dedicated test. Cover it through whichever higher-level test already exercises it.
- `data-transfer-objects/`, `types/`, and `definitions/` may be covered indirectly through the module's higher-level test, as long as every distinct shape they can take is hit by at least one of those tests. Add a direct test for a `types/` factory's normalization branch only if no higher-level test already exercises it.

## 2. Infrastructure Services

`filesystem`, `git`, `shell`, `env`, `terminal/input`, and `terminal/output` each keep their own dedicated test file even though each is one file. Each wraps a genuinely distinct external resource with its own failure modes, so there's no shared behavior to group them under.

## 3. Related Skills

- **General TypeScript conventions**: [write-typescript-code](../write-typescript-code/SKILL.md)
