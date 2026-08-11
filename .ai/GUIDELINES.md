# agenteq Guidelines

## Architecture

agenteq's dependencies flow in one direction. `console`, the application layer, depends on `modules`, the domain layer, plus `infrastructure`, `support`, and `shared`. `modules` depends on `infrastructure`, `support`, and `shared`. Nothing under `infrastructure`, `support`, or `shared` may import from `console` or `modules`.

`console` owns how a run was invoked: its flags, its env vars, its prompts, its output. `modules` owns what things mean and how they behave, regardless of the CLI.

Two domain modules exist: `agents` defines what a coding agent is and how to detect or register one. `artifacts` syncs capabilities, mcp, commands, skills, and guidelines, to disk.

A module may not reach into another module's `entities/` or `services/` directly, except through its public surface: an `index.ts`, a registry, or an explicit export. Before adding a cross-module dependency, ask whether that dependency belongs in `modules/shared/` instead.

For the full vocabulary, folder-by-folder layout, and style rules, see [write-typescript-code](./.ai/skills/write-typescript-code/SKILL.md).

## Adding to agenteq

* Adding support for a new coding agent: [add-agent-definition](./.ai/skills/add-agent-definition/SKILL.md).
* Adding a new sync capability (beyond mcp, commands, skills, guidelines): [add-capability-stage](./.ai/skills/add-capability-stage/SKILL.md).
* Writing or updating a test: [write-tests](./.ai/skills/write-tests/SKILL.md).
* Writing or reviewing a comment: [commenting-standards](./.ai/skills/commenting-standards/SKILL.md).
* Verifying every agent's synced output against that agent's real config format: [e2e-test-agents](./.ai/skills/e2e-test-agents/SKILL.md).

## Writing Style

Every skill, guideline, and code comment in this project is written in Standard Technical English. That means plain, direct, unambiguous prose, built up one idea at a time instead of packed into a single dense sentence.

## Agent Behavior

Communication:

* No emojis in responses, except requirement markers.
* Do not generate unnecessary markdown files, such as `COMPLETION_REPORT.md` or `SUMMARY.md`.
* Do not assume an action from an observation.
* When the user asks a question, answer the question first. A question is not an instruction to start editing files. Wait for explicit instruction before making any change.
* Keep status reports and summaries short and direct.

Artifact management:

* Every AI-generated artifact goes in `.ai/artifacts/`. Never `docs/`, never the project root. This includes:
    * Execution plans, unless the environment has interactive plans, such as Antigravity
    * Summaries
    * Audits
    * Analysis reports
    * Investigation notes
    * Any other AI-generated documentation
* Name each artifact file descriptively, and include a date, for example `SECURITY_AUDIT_2026_01_14.md`.
* Do not modify user-managed documentation in `docs/`, `wiki/`, or any other project folder, unless the user explicitly asks for it.
