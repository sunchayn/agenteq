# Refactor demo

A snapshot of a repo before agenteq. `.claude/` and `.cursor/` are both fully configured and tracked in git, there is no `.ai/` folder yet.

Use it to try the [refactor-to-agenteq](/.ai/skills/refactor-to-agenteq) skill end to end.

- Claude Code is the richer, actively maintained agent here: `CLAUDE.md`, `.claude/skills/`, `.claude/commands/`, `.mcp.json`. Treat it as the reverse-engineering baseline.
- Cursor's files, `AGENTS.md`, `.cursor/skills/`, `.cursor/commands/`, `.cursor/mcp.json`, mostly match, but not entirely, on purpose.
    - `AGENTS.md` has one guideline that `CLAUDE.md` does not.
    - `.cursor/skills/review-checklist/` has no counterpart under `.claude/skills/`.
    - `.cursor/mcp.json` has an extra `postgres` server that `.mcp.json` does not.

Copy this folder into a scratch git repo and commit it, then run the skill against it.
