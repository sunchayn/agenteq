# Laravel Boost example

A snapshot of a repo right after `php artisan boost:install --guidelines --skills`, before `agenteq` has run at all.

- `boost.json` is Boost's own file, naming `claude_code` and `cursor` as the agents it wrote into.
- `CLAUDE.md` and `AGENTS.md` each hold only Boost's `<laravel-boost-guidelines>` block, exactly what Boost itself writes into every agent it targets.
- `.claude/skills/laravel-pint/` and `.cursor/skills/laravel-pint/` are a skill Boost generated for both agents. `agenteq` never reads or mirrors these, they stay exactly where Boost put them.
- `.ai/GUIDELINES.md` is the project's own hand-authored source, unrelated to Boost.
- `.ai/mcp/laravel-boost/config.json` is a normal MCP config, hand-added here the same way you would add any other server, `agenteq` does not write this file for you.

Copy this folder into a scratch git repo and commit it, then run:

```bash
npx agenteq init --agents claude_code,cursor --yes
```

What comes out:

- `CLAUDE.md` and `AGENTS.md` are both rewritten with the hand-authored guidelines first, followed by Boost's block, re-wrapped in the same `<laravel-boost-guidelines>` tags.
- `.claude/skills/laravel-pint/` and `.cursor/skills/laravel-pint/` are left exactly as Boost wrote them. Skills stay Boost's concern, `agenteq` never reads or mirrors them, even between two agents Boost itself already targeted.
- `.mcp.json` and `.cursor/mcp.json` both gain a `laravel-boost` MCP server entry, `php artisan boost:mcp`, because `.ai/mcp/laravel-boost/config.json` defines it explicitly. `agenteq` would not have added it on its own.
- `.gitignore` picks up `CLAUDE.md`, `AGENTS.md`, `.claude/skills`, and `.cursor/skills`, even though `agenteq` never reads or mirrors either skills directory's content.

Re-running `boost:install` after installing a new package, then `agenteq sync` again, picks up the change with no extra step.
