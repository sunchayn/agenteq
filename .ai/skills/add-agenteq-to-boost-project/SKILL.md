---
name: add-agenteq-to-boost-project
description: Wires agenteq onto a Laravel project that already runs Laravel Boost. Reconciles MCP servers and commands from every agent's native files into agenteq's canonical .ai/ source, wires agenteq's sync into Boost's own composer and git hooks so both run together, and runs a real agenteq sync. Leaves Boost's own guidelines fragments, skills, and rules untouched.
---

# Adding agenteq to a Laravel Boost Project

## 1. End state

- `.ai/GUIDELINES.md` holds only hand-authored project guidance. Never Boost's `<laravel-boost-guidelines>` block. A local file it linked to now lives under `.ai/references/`, pointed at with `@reference(...)`.
- `.ai/mcp/<name>/config.json` for every MCP server configured for any agent. Includes `.ai/mcp/laravel-boost/config.json` when Boost's MCP server is in use.
- `.ai/commands/**` for every command file configured for any agent. Boost has no commands feature, so all found commands are hand-authored.
- `.ai/skills/`, `.ai/guidelines/`, `.ai/rules` untouched. They are Boost's directories, not agenteq's. agenteq detects `boost.json`'s `skills` field and drops the `skills` capability for this project. Boost alone manages skills.
- `agenteq/config.json` with chosen agents and capabilities `mcp`, `commands`, `guidelines`, `references`. No `skills`.
- Every generated per-agent file gitignored, including Boost's per-agent files not already ignored.
- Boost's composer `post-install-cmd`/`post-update-cmd` extended to run `npx agenteq sync --yes --skip-in-ci` right after Boost's command, when that wiring exists.
- Any existing git hook that calls Boost extended the same way.

## 2. Confirm this is a Boost project

`boost.json` must exist at the project root and parse as JSON with at least an `agents` array. Example:

```json
{ "agents": ["claude_code", "cursor"], "guidelines": true, "skills": ["boost"], "mcp": true }
```

If missing, stop. This skill assumes `php artisan boost:install` already ran. If the user wants agenteq without Boost and the project has scattered per-agent config, tell them to install `refactor-to-agenteq`:

```bash
npx skills add https://github.com/sunchayn/agenteq --skill refactor-to-agenteq
```

Then invoke `/refactor-to-agenteq`. If the project has no per-agent config, `npx agenteq init` alone is enough.

## 3. Source directory is `.ai`

Use `.ai` (agenteq's `DEFAULT_SOURCE_DIR`, also Boost's directory) for every path. Do not ask the user for another.

`.ai` may hold content from an earlier partial setup (hand-authored guidelines, commands, MCP configs) next to Boost's `.ai/skills`, `.ai/guidelines`, `.ai/rules`. Treat it as current canonical state. Merge into it. Do not overwrite.

## 4. Determine the agent set

`boost.json`'s `agents` array lists Boost's agents. Run `npx agenteq detect --json` to find agents installed or configured here that `boost.json` does not list.

Ask the user whether to add those extra agents to agenteq's sync set. agenteq folds Boost's guidelines block into every agent it syncs, extras included. Boost's skills do not reach extras, since Boost alone distributes skills here (step 1).

Confirm the final agent list with the user before continuing.

## 5. Reverse-engineer hand-authored guidelines into `.ai/GUIDELINES.md`

For each agent in `boost.json`, read its guidelines file. Path: Guidelines column of the section 14 table.

Strip the `<laravel-boost-guidelines>...</laravel-boost-guidelines>` block, matching `/<laravel-boost-guidelines>(.*?)<\/laravel-boost-guidelines>/s`. Do not carry its content into `.ai/GUIDELINES.md`. agenteq reads that block live from the agent's file on every sync. A copy in `.ai/GUIDELINES.md` would duplicate it and the two could diverge.

Text outside the block is hand-authored guidance. Boost does not write or modify it. Merge it into `.ai/GUIDELINES.md`. If it differs between two agents' files, show the user the actual difference and ask. Do not guess.

Nothing left after stripping: leave `.ai/GUIDELINES.md` unwritten. No empty placeholder. `agenteq sync` adds Boost's block over a missing source file.

While merging, look for a link to another local file in the hand-authored text: a path, not a URL. Move that file to `.ai/references/<same relative path, or a short descriptive one if the original has none>`. Rewrite the link as `@reference(<that path>)`. Skip a link already pointing inside `.ai/references/`, or already written as an annotation.

## 6. Reconcile MCP servers, including Boost's own

For every agent from step 4:

1. Read its MCP config file. File path, format, key path, native field names: section 14 table.
2. Parse it (JSON, TOML, or JSONC per the table). Read entries at the key path.
3. For every entry except `laravel-boost`, write `.ai/mcp/<key>/config.json`. Directory name is the entry key. No separate `"key"` field. Pretty-print, 4-space indentation, one field per line:

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
- `(no native remote, see mcp-remote note)`: a stdio entry running `npx -y mcp-remote <url>` is a disguised remote server. Reverse it into a canonical `http` entry with that URL.

Compare each entry across agents. Same content, or an agent's file empty or missing: do nothing. Different content (different arguments, URL, or an extra field): show the user the actual difference and ask. Never guess.

Handle `laravel-boost` separately:

- `boost.json` top-level `mcp` is `true`: read the entry from any MCP-capable agent from step 4 that has it. At least one should.
- Several agents have it and they differ: prefer a portable entry (`command`/`args` as plain `php`/`artisan`) over one with an absolute interpreter path, which some agents force. Use an absolute-path entry only if it is the only one, and flag it to the user as machine-specific.
- Sail or WSL: `command` is a wrapper such as `./vendor/bin/sail`, `args` stays `["artisan", "boost:mcp"]`. Copy the entry exactly as found. That is how this project runs it.
- Write the result to `.ai/mcp/laravel-boost/config.json`, same shape as every other entry:

    ```json
    {
        "type": "stdio",
        "config": { "command": "php", "args": ["artisan", "boost:mcp"] }
    }
    ```

- `mcp` is `false` or absent and no agent file has the entry: nothing to reconcile.
- `mcp` is `true` but no agent file has the entry: project state does not match `boost.json`. Tell the user and ask whether to add the entry above. Do not guess.

`laravel-boost` goes through the same MCP reconciliation as every other server. It is not a separate mechanism.

## 7. Reconcile commands

For every agent from step 4, check the Commands dir column of the section 14 table. If it lists a directory and the directory exists, copy each command file into `.ai/commands/`. If the table shows a non-`.md` extension, rename back to `.md`.

Compare copied commands across agents. A file matches, or an agent has no commands directory: do nothing. A file differs (extra or missing command, or different content under the same name): show the user the actual difference and ask. Do not guess.

Boost has no commands feature. Every command file here is hand-authored. No Boost-specific handling.

## 8. Run the real sync

Do not reimplement agenteq's gitignore or file-writing logic. Run the tool:

```bash
npx agenteq init --agents <comma-separated agent names from step 4> --yes
```

agenteq detects `boost.json`'s `skills` field and drops `skills` from the default capabilities when Boost manages skills here. No `--only` flag needed. The default is saved in `agenteq/config.json`, so every later bare `agenteq sync`, including those in the step 10 and 11 hooks, also excludes `skills`.

## 9. Untrack generated files from git

`agenteq init` warns about any newly ignored path that git already tracked, and prints the fix:

```
git rm -r --cached <paths>
```

Run it whenever the warning appears. This step is mandatory. Show the command and confirm with the user first. After confirmation, run it in the same turn. Do not end the skill with an unresolved warning on screen. Then stage the `.gitignore` update and the removal together, and confirm with `git status` that none of the warned paths remain tracked. Tell the user a commit is still needed. Do not commit unless asked.

No warning: nothing to untrack.

## 10. Wire agenteq into Boost's composer hooks

Read `composer.json` `scripts.post-install-cmd` and `scripts.post-update-cmd`. Each is a string or an array of strings. Each entry is one of:

- A literal command, e.g. `"@php artisan boost:update --ansi"`.
- A reference to another composer script, `"@scriptname"`. Resolve via `scripts["scriptname"]` and inspect it the same way, recursively. Projects often wrap the Boost call in a `deploy`, `setup`, or similar script called from `post-update-cmd`.
- A call to an external script file, e.g. `"bash scripts/post-update.sh"`, `"./bin/deploy.sh"`, `"php scripts/setup.php"`. Read that file and trace its references the same way, recursively.

Search all of these, direct and resolved, for a call to `artisan boost:install` or `artisan boost:update`. Allow a Sail-style `vendor/bin/sail artisan` wrapper, matching what step 6 found.

- Found in `composer.json`: insert `"npx agenteq sync --yes --skip-in-ci"` as a new entry right after the Boost call, in whichever array contains it (top-level hook or resolved nested script). Composer runs array entries in order, which gives Boost first, then agenteq. Do not combine the two into one `&&` line.
- Found in an external script file: add `npx agenteq sync --yes --skip-in-ci` as its own line right after the Boost call. Match the file's language and style: a bare shell line in a bash script, or the shell-running function the PHP script already uses (`shell_exec`, `passthru`, `exec`). Do not invent a new invocation style.
- Found nowhere: nothing to extend. Boost's docs never wire this automatically. Tell the user nothing was found and ask whether to add it from scratch. Add only if they agree, under the key they choose. `post-update-cmd` is the more common choice, since `boost:update` is most often placed there.

Confirm with the user before writing to `composer.json` or an external script file.

## 11. Reconcile Boost-aware git hooks

Look for a git hook whose body calls `artisan boost:install` or `artisan boost:update`, directly or through an intermediate script file (trace it as in step 10). Check every hook system:

- Husky: `.husky/` directory, or `"prepare": "husky"` in `package.json`.
- lefthook: `lefthook.yml` or `lefthook.yaml`.
- simple-git-hooks: `"simple-git-hooks"` field in `package.json`.
- pre-commit framework: `.pre-commit-config.yaml`.
- Overcommit: `.overcommit.yml`.
- Plain native hook under `.git/hooks/`.

### 11.1 A Boost-aware hook exists

Extend that hook with `npx agenteq sync --yes --skip-in-ci`, right after the Boost call (same ordering as step 10). Do not add a second hook.

### 11.2 No Boost-aware hook exists

Nothing Boost-specific to extend. Still offer a `post-checkout` hook running `npx agenteq sync --yes --skip-in-ci`. `.ai/` content changes across branches. After checking out a branch with different guidelines, commands, or MCP servers, generated files are stale until someone runs `agenteq sync`.

Reuse the hook system the project already uses for anything else. Do not add a second manager. If it uses none, ask the user which to install, or whether to skip hooks. Do not choose for them.

Confirm with the user before adding or changing any hook.

## 12. Clean up superseded artifacts

`agenteq sync` overwrites a file at each agent's target path when the canonical source has a match. It never deletes a file with no canonical counterpart, e.g. a command file step 7 chose not to keep. List such files. Ask the user before deleting. Never delete silently.

## 13. Report back

Short status summary:

- Agents from `boost.json`, and agents detected separately and added.
- How leftover hand-authored guidelines were reconciled.
- MCP servers reconciled, and whether `laravel-boost` was found, missing, or flagged machine-specific.
- Commands reconciled.
- What was untracked from git.
- Composer and git hook wiring found and extended, or offered and declined.
- Reminder: `.ai/skills`, `.ai/guidelines`, `.ai/rules` stay Boost's, and agenteq's sync excludes `skills` here.

Not a new artifact file.

## 14. Reference: native paths and MCP shapes per agent

This table is the mapping agenteq ships today. If `npx agenteq detect --json` contradicts a row, trust the tool, the table may be out of date. Tell the user about the discrepancy. Do not pick one silently.

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
- `command:[cmd,...args]`: command and arguments share one array. Split per step 6.
- `(no type)`: remote entries carry no `type` field. Infer per step 6.
- `(no native remote, see mcp-remote note)`: agent has no remote MCP support. See step 6 for recognizing and reversing the disguised entry.
