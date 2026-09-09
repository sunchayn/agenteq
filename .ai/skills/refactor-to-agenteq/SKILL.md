---
name: refactor-to-agenteq

description: Reverse-engineers a repo's scattered per-agent AI configuration (guidelines, skills, commands, MCP servers) into agenteq's canonical .ai/ source of truth, then runs a real agenteq sync and untracks the generated files from git.
---

# Refactoring a Repo to agenteq

## 1. What this produces

The end state matches what `npx agenteq init` produces on a repo with no existing AI configuration.

- A canonical source directory, default `.ai`: `GUIDELINES.md`, `mcp/<name>/config.json`, `commands/**`, `skills/**`.
- An `agenteq.json` file recording the chosen agents and capabilities.
- Every generated per-agent file (`CLAUDE.md`, `.cursor/skills`, `.mcp.json`, and so on) gitignored.
- No generated file left tracked in git.

Nothing under the canonical source directory is generated. It is the source every agent file comes from. This skill's job is to get real, scattered content into that directory without losing any of it, then hand off to agenteq's own CLI to generate the rest.

## 2. Ask for the source directory

Ask the user for the canonical source directory. Default: `.ai` (agenteq's `DEFAULT_SOURCE_DIR`). Use their answer for every path below.

If that directory already has content, treat it as the current canonical state. Merge new findings into it. Do not overwrite it.

## 3. Identify the primary agent

One coding agent runs this skill right now. Its files are the reverse-engineering baseline, they are the ones someone actually kept up to date.

- Check for a conclusive signal first: the current harness signals, an agent-specific environment variable (for example `CLAUDECODE` for Claude Code), or a tool surface that only makes sense for one agent.
- If no signal is conclusive, ask the user which agent is running this session.
- Confirm the chosen agent with the user before continuing. A wrong baseline makes every later diff in step 5 wrong too.

## 4. Reverse-engineer the primary agent's files into `.ai/`

Look up the primary agent's native paths and shapes in section 10's table. For each file or directory that exists, write its canonical equivalent. Use only content that already exists in the repo. Do not invent content.

### 4.1 Guidelines

Read the primary agent's guidelines file, the Guidelines column in the table. Write it to `<source dir>/GUIDELINES.md`.

### 4.2 Skills

If the table lists a skills directory for the primary agent, and it exists, copy each skill directory into `<source dir>/skills/`. Keep each skill's own directory name and its `SKILL.md`. Skip a symlink that points outside the repo, or into another tool's cache, that is not hand-authored content.

### 4.3 Commands

If the table lists a commands directory for the primary agent, and it exists, copy each command file into `<source dir>/commands/`. If the table shows a non-`.md` extension for that agent, rename the file back to `.md`.

### 4.4 MCP servers

If the table lists an MCP config file for the primary agent, and it exists:

1. Parse it (JSON, TOML, or JSONC, per the table). Read the entries at the table's MCP key path.
2. Write each entry as `<source dir>/mcp/<key>/config.json`, pretty-printed, 4-space indentation, one field per line, never a single compact line:

    ```json
    {
        "key": "<entry key>",
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

Map native fields to their canonical name using the table's Native stdio/remote fields columns, the field holding the command becomes `command`, the field holding the URL becomes `url`, and so on for `args`, `env`, `cwd`, and `headers`. Keep any field the table doesn't name, carried into `config` unchanged. Three notations need extra handling:

- `command:[cmd,...args]`: split the first array element into `command`, the rest into `args`.
- `(no type)`: infer `http`, unless the URL or a sibling field says otherwise. Ask the user when it stays ambiguous.
- `(no native remote, see mcp-remote note)`: a stdio entry running `npx -y mcp-remote <url>` is a disguised remote server. Reverse it into a canonical `http` entry with that URL. Its headers are already gone, agenteq drops them on the way out.

## 5. Reconcile every other agent's artifacts already in the repo

Run `npx agenteq detect --json`. Every entry with `projectInstalled: true`, other than the primary agent, already has its own native files in this repo (paths in section 10's table). For each one:

1. Read its guidelines file, skills, commands, and MCP config, the same way as step 4.
2. Compare it against what step 4 wrote to the canonical directory.
3. If a file matches, or the agent's file is empty or missing, do nothing. `agenteq sync` regenerates it.
4. If a file differs, guidelines content, an extra or missing skill, an extra or missing command, or an MCP server the canonical set lacks, stop. Ask the user how to resolve it. Show the actual diff, not just the fact that one exists. Offer choices: fold the extra content into the canonical source, keep the canonical version, or skip it and flag it in the final report. Never guess and proceed silently.

Once every deviation is resolved, the canonical directory is the agreed source of truth.

## 6. Run the real sync

Do not hand-roll agenteq's gitignore or file-writing logic. Run the tool itself.

```bash
npx agenteq init --agents <comma-separated agent names from steps 3 and 5> --source-dir <source dir> --yes
```

Use `--agents` with the exact set confirmed in steps 3 and 5. The non-interactive flags avoid a picker this session cannot answer. If the user wants a different agent set, for example dropping one they no longer use, confirm it with them first.

This one command picks the capabilities, writes every agent's guidelines/skills/commands/MCP file from the canonical source, and gitignores each path it writes, using agenteq's own `git.ignore` logic rather than a hand-written `.gitignore` edit.

## 7. Untrack generated files from git

`agenteq init` prints a warning for any path it just started ignoring that was already tracked by git, plus the fix:

```
git rm -r --cached <paths>
```

Run this command whenever that warning appears. This step is mandatory. Show the command to the user, and confirm before running it, untracking is reversible, but it changes what is staged for the next commit. Run it in the same turn once confirmed. Never end the skill, or a verification pass that re-ran `agenteq init`, with an unresolved warning still on screen. Afterward, stage the `.gitignore` update and the removal together, and confirm with `git status` that none of the warned paths remain tracked. Tell the user a commit is still needed. Do not commit on their behalf unless asked.

No warning means nothing to untrack.

## 8. Set up a hook to keep sync current

`.ai/` content changes across branches. Checking out a branch with different guidelines, skills, commands, or MCP servers leaves every generated file stale, until someone runs `agenteq sync` by hand. A `post-checkout` git hook running `npx agenteq sync --yes` closes that gap.

Reuse whatever hook system the repo already has. Never add a second one.

- Husky (a `.husky/` directory, or a `"prepare": "husky"` script in `package.json`): add or extend `.husky/post-checkout` with `npx agenteq sync --yes`.
- lefthook (`lefthook.yml` or `lefthook.yaml`): add a `post-checkout` entry under `commands`, running `npx agenteq sync --yes`.
- simple-git-hooks (a `"simple-git-hooks"` field in `package.json`): add `"post-checkout": "npx agenteq sync --yes"`. Tell the user to run `npx simple-git-hooks` once, to install it.
- pre-commit framework (`.pre-commit-config.yaml`): add a local hook with `stages: [post-checkout]`, running `npx agenteq sync --yes`.
- Overcommit (`.overcommit.yml`): add a `PostCheckout` hook running the same command.
- A plain native hook (`.git/hooks/post-checkout`): append the sync call to it. Do not overwrite what it already does.

None of those exist: ask the user which hook manager to install, or whether to skip hook setup entirely. Do not pick one on the user's behalf.

Confirm with the user before adding or changing a hook.

## 9. Clean up superseded artifacts

`agenteq sync` overwrites a same-named file at each agent's target path. It never deletes a file with no counterpart in the canonical source, for example a skill folder step 5 decided not to keep. List anything like that. Ask the user before deleting it. Never delete silently, this is exactly the stray content step 5 exists to catch.

## 10. Reference: native paths and MCP shapes per agent

Treat this table as the mapping agenteq ships today. If `npx agenteq detect --json` shows a capability that contradicts a row here, trust the tool's own output, the table is out of date. Note the discrepancy to the user rather than picking one silently.

| Agent (`name`) | Guidelines | Skills dir | Commands dir | MCP config (format) | MCP key path | Native stdio fields | Native remote fields |
|---|---|---|---|---|---|---|---|
| `claude_code` | `CLAUDE.md` | `.claude/skills` | `.claude/commands` | `.mcp.json` (JSON) | `mcpServers` | `command, args, env, cwd` | `type, url, headers` |
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

A dash means the agent has no support for that capability at all. `command:[cmd,...args]` means the command and its arguments share one array, split them per section 4.4. `(no type)` means the agent's remote entries carry no `type` field, infer it per section 4.4. `(no native remote, see mcp-remote note)` means the agent has no remote MCP support at all, see section 4.4 for how to recognize and reverse the disguised entry.

## 11. Report back

Summarize in plain terms: the reverse-engineering baseline agent, which other agents' artifacts were found and reconciled, how each deviation was resolved, what got untracked from git, and anything left for the user to decide. Keep it short, this is a status report, not a new artifact file.
