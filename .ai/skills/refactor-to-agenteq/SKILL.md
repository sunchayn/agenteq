---
name: refactor-to-agenteq
description: Reverse-engineers a repo's scattered per-agent AI configuration (guidelines, skills, commands, MCP servers) into agenteq's canonical .ai/ source of truth, then runs a real agenteq sync and untracks the generated files from git.
---

# Refactoring a Repo to agenteq

## 1. End state

Same as `npx agenteq init` on a repo with no AI configuration.

- Canonical source directory, default `.ai`: `GUIDELINES.md`, `mcp/<name>/config.json`, `commands/**`, `skills/**`.
- `agenteq.json` recording chosen agents and capabilities.
- Every generated per-agent file (`CLAUDE.md`, `.cursor/skills`, `.mcp.json`, etc.) gitignored.
- No generated file tracked in git.

Nothing in the canonical source directory is generated. It is the source for every agent file. This skill moves real scattered content into it without loss, then hands off to the agenteq CLI.

## 2. Ask for the source directory

Ask the user. Default: `.ai` (`DEFAULT_SOURCE_DIR`). Use the answer for every path below.

If the directory already has content, treat it as current canonical state. Merge new findings in. Do not overwrite.

## 3. Identify the primary agent

The agent running this skill is the baseline. Its files are the ones someone kept current.

- Look for a conclusive signal first: harness signals, an agent-specific env var (e.g. `CLAUDECODE` for Claude Code), or a tool surface unique to one agent.
- No conclusive signal: ask the user which agent runs this session.
- Confirm the agent with the user before continuing. A wrong baseline makes every diff in step 5 wrong.

## 4. Reverse-engineer the primary agent's files into the source directory

Look up the primary agent's paths and shapes in the section 10 table. For each existing file or directory, write its canonical equivalent. Use only content already in the repo. Do not invent content.

### 4.1 Guidelines

Read the primary agent's guidelines file (Guidelines column). Write it to `<source dir>/GUIDELINES.md`.

### 4.2 Skills

If the table lists a skills directory for the primary agent and it exists, copy each skill directory into `<source dir>/skills/`, keeping directory name and `SKILL.md`. Skip a symlink pointing outside the repo or into another tool's cache. That is not hand-authored content.

### 4.3 Commands

If the table lists a commands directory for the primary agent and it exists, copy each command file into `<source dir>/commands/`. If the table shows a non-`.md` extension, rename back to `.md`.

### 4.4 MCP servers

If the table lists an MCP config file for the primary agent and it exists:

1. Parse it (JSON, TOML, or JSONC, per the table). Read entries at the MCP key path.
2. Write each entry to `<source dir>/mcp/<key>/config.json`. The directory name is the entry key. No separate `"key"` field. Pretty-print with 4-space indentation, one field per line:

    ```json
    {
        "type": "stdio | http | sse",
        "config": { }
    }
    ```

`config` fields by type:

| `type` | `config` fields |
|---|---|
| `stdio` | `command` (required), `args`, `env`, `cwd` |
| `http` | `url` (required), `headers` |
| `sse` | `url` (required), `headers` |

Map native fields to canonical names using the Native stdio/remote fields columns: command field becomes `command`, URL field becomes `url`, same for `args`, `env`, `cwd`, `headers`. Carry any field the table does not name into `config` unchanged. Three notations need extra handling:

- `command:[cmd,...args]`: first array element becomes `command`, the rest become `args`.
- `(no type)`: infer `http` unless the URL or a sibling field says otherwise. Ask the user if still ambiguous.
- `(no native remote, see mcp-remote note)`: a stdio entry running `npx -y mcp-remote <url>` is a disguised remote server. Reverse it into a canonical `http` entry with that URL. Its headers are already gone, agenteq drops them on the way out.

## 5. Reconcile every other agent's artifacts

Run `npx agenteq detect --json`. Each entry with `projectInstalled: true`, other than the primary agent, has native files in this repo (paths in the section 10 table). For each:

1. Read its guidelines file, skills, commands, MCP config, same as step 4.
2. Compare against what step 4 wrote.
3. File matches, or agent's file is empty or missing: do nothing. `agenteq sync` regenerates it.
4. File differs (guidelines content, extra or missing skill, extra or missing command, MCP server missing from the canonical set): stop and ask the user. Show the actual diff, not only that one exists. Offer: fold the extra content into the canonical source, keep the canonical version, or skip and flag it in the final report. Never guess silently.

After every deviation is resolved, the canonical directory is the agreed source of truth.

## 6. Run the real sync

Do not hand-roll agenteq's gitignore or file-writing logic. Run the tool.

```bash
npx agenteq init --agents <comma-separated agent names from steps 3 and 5> --source-dir <source dir> --yes
```

Use the exact agent set confirmed in steps 3 and 5. The flags skip the picker, which this session cannot answer. If the user wants a different set (e.g. dropping an unused agent), confirm first.

This one command picks capabilities, writes every agent's guidelines/skills/commands/MCP file from the canonical source, and gitignores each path it writes using agenteq's own `git.ignore` logic.

## 7. Untrack generated files from git

`agenteq init` warns about any newly ignored path that git already tracks, and prints the fix:

```
git rm -r --cached <paths>
```

Run it whenever the warning appears. This step is mandatory. Show the command and confirm with the user first. Untracking is reversible, but it changes what is staged for the next commit. After confirmation, run it in the same turn. Never end the skill, or a verification pass that re-ran `agenteq init`, with an unresolved warning on screen. Then stage the `.gitignore` update and the removal together, and confirm with `git status` that none of the warned paths remain tracked. Tell the user a commit is still needed. Do not commit unless asked.

No warning: nothing to untrack.

## 8. Hook to keep sync current

`.ai/` content changes across branches. After checking out a branch with different guidelines, skills, commands, or MCP servers, generated files are stale until someone runs `agenteq sync`. A `post-checkout` git hook running `npx agenteq sync --yes --skip-in-ci` fixes this.

Reuse the repo's existing hook system. Never add a second one.

- Husky (`.husky/` directory, or `"prepare": "husky"` in `package.json`): add or extend `.husky/post-checkout` with `npx agenteq sync --yes --skip-in-ci`.
- lefthook (`lefthook.yml` or `lefthook.yaml`): add a `post-checkout` entry under `commands` running `npx agenteq sync --yes --skip-in-ci`.
- simple-git-hooks (`"simple-git-hooks"` field in `package.json`): add `"post-checkout": "npx agenteq sync --yes --skip-in-ci"`. Tell the user to run `npx simple-git-hooks` once to install it.
- pre-commit framework (`.pre-commit-config.yaml`): add a local hook with `stages: [post-checkout]` running `npx agenteq sync --yes --skip-in-ci`.
- Overcommit (`.overcommit.yml`): add a `PostCheckout` hook running the same command.
- Plain native hook (`.git/hooks/post-checkout`): append the sync call. Do not overwrite existing content.

None exist: ask the user which hook manager to install, or whether to skip hooks. Do not choose for them.

Confirm with the user before adding or changing a hook.

## 9. Clean up superseded artifacts

`agenteq sync` overwrites a same-named file at each agent's target path. It never deletes a file with no canonical counterpart, e.g. a skill folder step 5 decided not to keep. List such files. Ask the user before deleting. Never delete silently.

## 10. Reference: native paths and MCP shapes per agent

This table is the mapping agenteq ships today. If `npx agenteq detect --json` contradicts a row, trust the tool, the table is out of date. Tell the user about the discrepancy. Do not pick one silently.

| Agent (`name`) | Guidelines | Skills dir | Commands dir | MCP config (format) | MCP key path | Native stdio fields | Native remote fields |
|---|---|---|---|---|---|---|---|
| `claude_code` | `CLAUDE.md` | `.claude/skills` | `.claude/commands` | `.mcp.json` (JSON) | `mcpServers` | `type:"stdio", command, args, env, cwd` | `type, url, headers` |
| `cursor` | `AGENTS.md` | `.cursor/skills` | `.cursor/commands` | `.cursor/mcp.json` (JSON) | `mcpServers` | `type:"stdio", command, args, env, cwd` | `url, headers` (no type) |
| `windsurf` | `.windsurfrules` | - | `.windsurf/workflows` | - | - | - | - |
| `devin` | `AGENTS.md` | `.devin/skills` | - | `.devin/mcp_config.json` (JSON) | `mcpServers` | `command, args, env, cwd` | `transport, url, headers` |
| `codex` | `AGENTS.md` | `.agents/skills` | - | `.codex/config.toml` (TOML) | `mcp_servers` | `command, args, env, cwd` | `url, http_headers` (no type) |
| `copilot` | `.github/copilot-instructions.md` | - | `.github/prompts` (`.prompt.md`) | `.vscode/mcp.json` (JSON) | `servers` | `type:"stdio", command, args, env, cwd` | `type, url, headers` |
| `copilot_cli` | `AGENTS.md` | `.github/skills` | - | `.mcp.json` (JSON) | `mcpServers` | `command, args, env, cwd` | `type, url, headers` |
| `copilot_jetbrains` | `.github/copilot-instructions.md` | - | - | - | - | - | - |
| `antigravity` | `AGENTS.md` | `.agents/skills` | - | `.agents/mcp_config.json` (JSON) | `mcpServers` | `command, args, env, cwd` | `serverUrl, headers` (no type) |
| `amp` | `AGENTS.md` | `.agents/skills` | - | `.amp/settings.json` (JSON) | `amp.mcpServers` | `command, args, env, cwd` | `url, headers` (no type) |
| `factory` | `AGENTS.md` | `.factory/skills` | `.factory/commands` | `.factory/mcp.json` (JSON) | `mcpServers` | `type:"stdio", command, args, env, cwd` | `type, url, headers` |
| `grok_build` | `AGENTS.md` | `.grok/skills` | - | `.grok/config.toml` (TOML) | `mcp_servers` | `command, args, env, cwd` | `url, headers` (no type) |
| `junie` | `AGENTS.md` | `.junie/skills` | `.junie/commands` | `.junie/mcp/mcp.json` (JSON) | `mcpServers` | `command, args, env, cwd` | (no native remote, see mcp-remote note) |
| `kiro` | `AGENTS.md` | `.kiro/skills` | - | `.kiro/settings/mcp.json` (JSON) | `mcpServers` | `command, args, env, cwd` | `url, headers` (no type) |
| `opencode` | `AGENTS.md` | `.agents/skills` | `.opencode/command` | `opencode.json` (JSON) | `mcp` | `type:"local", command:[cmd,...args], environment, enabled` | `type:"remote", url, headers, enabled` |
| `pi` | `AGENTS.md` | `.pi/skills` | `.pi/prompts` | - | - | - | - |
| `zed` | `AGENTS.md` | `.agents/skills` | - | `.zed/settings.json` (JSON) | `context_servers` | `command, args, env, cwd` | `url, headers` (no type) |
| `goose` | `.goosehints` | - | - | - | - | - | - |
| `cline` | `.clinerules` | `.cline/skills` | - | - | - | - | - |
| `cline_cli` | `.clinerules` | `.cline/skills` | - | - | - | - | - |
| `roo` | `.roorules` | - | - | `.roo/mcp.json` (JSON) | `mcpServers` | `command, args, env, cwd` | `type` (`http` written as `streamable-http`), `url, headers` |
| `kilo` | `.kilocode/rules/AGENTS.md` | - | - | `kilo.jsonc` (JSONC) | `mcp` | `type:"local", command:[cmd,...args], environment, enabled` | `type:"remote", url, headers, enabled` |

Legend:
- `-`: agent has no support for that capability.
- `command:[cmd,...args]`: command and arguments share one array. Split per section 4.4.
- `(no type)`: remote entries carry no `type` field. Infer per section 4.4.
- `(no native remote, see mcp-remote note)`: agent has no remote MCP support. See section 4.4 for recognizing and reversing the disguised entry.

## 11. Report back

Short status summary: baseline agent, which other agents' artifacts were found and reconciled, how each deviation was resolved, what was untracked from git, and what is left for the user to decide. Not a new artifact file.
