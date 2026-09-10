---
name: add-agenteq-to-boost-project

description: Wires agenteq onto a Laravel project that already runs Laravel Boost. Reconciles MCP servers and commands from every agent's native files into agenteq's canonical .ai/ source, wires agenteq's sync into Boost's own composer and git hooks so both run together, and runs a real agenteq sync. Leaves Boost's own guidelines fragments, skills, and rules untouched.
---

# Adding agenteq to a Laravel Boost Project

## 1. What this produces

- `.ai/GUIDELINES.md` holding only hand-authored project guidance. It never holds Boost's own `<laravel-boost-guidelines>` block.
- `.ai/mcp/<name>/config.json` for every MCP server already configured for any agent. This includes `.ai/mcp/laravel-boost/config.json` when Boost's own MCP server is in use.
- `.ai/commands/**` for every command file already configured for any agent. Boost has no commands feature. Every command file found here is hand-authored, agent-native content.
- `.ai/skills/`, `.ai/guidelines/`, and `.ai/rules` left exactly as Boost put them. These are Boost's own canonical directories. They are not agenteq's. agenteq detects `boost.json`'s `skills` field on its own and drops the `skills` capability from its sync for this project. Skills stay entirely under Boost's own management.
- An `agenteq.json` file recording the chosen agents and capabilities. The capabilities are `mcp`, `commands`, and `guidelines`. They do not include `skills`.
- Every generated per-agent file git ignored. This includes Boost's own per-agent files, wherever they were not already git ignored.
- Boost's own composer `post-install-cmd`/`post-update-cmd` wiring extended to run `npx agenteq sync --yes` right after Boost's own command, when that wiring already exists.
- Any existing git hook that already calls Boost, extended the same way.

## 2. Confirm this is a Boost project

Check for `boost.json` at the project root. It must parse as JSON with at least an `agents` array. For example:

```json
{ "agents": ["claude_code", "cursor"], "guidelines": true, "skills": ["boost"], "mcp": true }
```

If `boost.json` is missing, stop. This skill assumes `php artisan boost:install` already ran. If the user wants agenteq without Laravel Boost, and the project already has scattered per-agent config to reconcile, tell them to install the `refactor-to-agenteq` skill instead:

```bash
npx skills add https://github.com/sunchayn/agenteq --skill refactor-to-agenteq
```

Then invoke it via `/refactor-to-agenteq`. If the project has no existing per-agent config at all, running `npx agenteq init` directly is enough, no skill is needed for that case.

## 3. Use `.ai` as the source directory

Use `.ai` as the canonical source directory. This is agenteq's `DEFAULT_SOURCE_DIR`, and it is the same directory Boost itself already uses. Do not ask the user to pick a different one. Use `.ai` for every path in this skill.

`.ai` may already hold content from an earlier partial setup, for example hand-authored guidelines, commands, or MCP configs, in addition to Boost's own `.ai/skills`, `.ai/guidelines`, and `.ai/rules`. Treat that content as the current canonical state. Merge new findings into it. Do not overwrite it.

## 4. Determine the agent set

`boost.json`'s `agents` array names the agents Boost is currently configured for. Then run `npx agenteq detect --json` to find any agent installed or configured in this project that `boost.json` does not name.

Ask the user whether to include those extra agents in the set agenteq syncs to. agenteq folds Boost's guidelines block into every agent it syncs, including these extra agents. Boost's skills do not reach these extra agents. Boost is the only tool that distributes skills in this project. See step 1.

Confirm the final combined agent list with the user before continuing.

## 5. Reverse-engineer hand-authored guidelines into `.ai/GUIDELINES.md`

For each agent named in `boost.json`, read its own guidelines file. Use the Guidelines column in the table in section 14 to find the path for that agent.

Remove the `<laravel-boost-guidelines>...</laravel-boost-guidelines>` block from the text you read, matching `/<laravel-boost-guidelines>(.*?)<\/laravel-boost-guidelines>/s`. Do not carry that block's content into `.ai/GUIDELINES.md`. agenteq reads that block live from the agent's own file on every sync. Writing it into `.ai/GUIDELINES.md` as well would duplicate it, and the two copies could later disagree.

The text that remains outside that block is hand-authored project guidance. Boost does not write or modify this text. Merge it into `.ai/GUIDELINES.md`. If the remaining text differs between two agents' files, show the user the actual difference and ask how to resolve it. Do not guess.

If no text remains after the block is removed, there is no hand-authored content to preserve. Leave `.ai/GUIDELINES.md` unwritten. Do not create an empty placeholder file. `agenteq sync` already adds Boost's block on top of a missing source file.

## 6. Reconcile MCP servers, including Boost's own

For every agent from step 4:

1. Read its own MCP config file. Use the table in section 14 for the file path, format, key path, and native field names.
2. Parse the file (JSON, TOML, or JSONC, per the table). Read the entries at the key path.
3. For every entry except `laravel-boost`, write `.ai/mcp/<key>/config.json`, pretty-printed, 4-space indentation, one field per line, never a single compact line:

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

Map native fields to their canonical name using the table's Native stdio/remote fields columns, the field holding the command becomes `command`, the field holding the URL becomes `url`, and so on for `args`, `env`, `cwd`, and `headers`. Keep any field the table does not name, carried into `config` unchanged. Three notations need extra handling:

- `command:[cmd,...args]`: split the first array element into `command`, the rest into `args`.
- `(no type)`: infer `http`, unless the URL or a sibling field says otherwise. Ask the user when it stays ambiguous.
- `(no native remote, see mcp-remote note)`: a stdio entry running `npx -y mcp-remote <url>` is a disguised remote server. Reverse it into a canonical `http` entry with that URL.

Compare each entry across agents. Same content, or an agent's file empty or missing, do nothing. Different content, for example different arguments, a different URL, or an extra field, show the user the actual difference and ask. Never guess.

Handle the `laravel-boost` entry as its own case:

- `boost.json`'s top-level `mcp` is `true`: read the entry from whichever MCP-capable agent from step 4 has it. At least one should.
- More than one agent has it, and they differ: prefer a portable entry, `command`/`args` as plain `php`/`artisan`, over one using an absolute interpreter path, some agents force this. Use the absolute-path entry only if it is the only one available, and flag it to the user as machine-specific.
- Sail or WSL: `command` becomes a wrapper, for example `./vendor/bin/sail`, `args` stays `["artisan", "boost:mcp"]`. Copy the entry exactly as found, that is how this project runs it.
- Write the result to `.ai/mcp/laravel-boost/config.json`, same shape as every other entry:

    ```json
    {
        "key": "laravel-boost",
        "type": "stdio",
        "config": { "command": "php", "args": ["artisan", "boost:mcp"] }
    }
    ```

- `mcp` is `false` or absent, and no agent's file carries the entry: nothing to reconcile, move on.
- `mcp` is `true` but no agent's file carries the entry: the project state does not match `boost.json`. Tell the user instead of guessing, and ask whether to add the entry above.

`laravel-boost` is one more entry in the same MCP reconciliation every other server goes through, not a separate mechanism.

## 7. Reconcile commands

For every agent from step 4, check the Commands dir column in the table in section 14. If that column lists a directory for the agent, and it exists, copy each command file into `.ai/commands/`. If the table shows a non-`.md` extension for that agent, rename the file back to `.md`.

Compare the copied commands across agents. If a command file matches, or an agent has no commands directory, do nothing. If a command file differs, for example an extra or missing command, or different content under the same name, show the user the actual difference and ask how to resolve it. Do not guess.

Boost has no commands feature. Every command file found here is hand-authored, agent-native content. No Boost-specific handling is needed.

## 8. Run the real sync

Do not reimplement agenteq's gitignore or file-writing logic by hand. Run the tool itself:

```bash
npx agenteq init --agents <comma-separated agent names from step 4> --yes
```

agenteq detects `boost.json`'s `skills` field on its own and drops `skills` from the default capability list when Boost already manages skills for this project. No `--only` flag is needed for that. This saved default is written into `agenteq.json`, so every later bare `agenteq sync`, including the one the hooks in steps 10 and 11 call, keeps excluding `skills` too.

## 9. Untrack generated files from git

`agenteq init` prints a warning for any path it just started ignoring that git already tracked. It also prints the fix for that path:

```
git rm -r --cached <paths>
```

Run this command whenever that warning appears. This step is mandatory. Show the command to the user, and confirm before running it. Run it in the same turn once the user confirms. Do not end the skill with an unresolved warning still on screen. Afterward, stage the `.gitignore` update and the removal together. Confirm with `git status` that none of the warned paths remain tracked. Tell the user a commit is still needed. Do not commit on the user's behalf unless asked.

No warning means there is nothing to untrack.

## 10. Wire agenteq into Boost's composer hooks

Read `composer.json`'s `scripts.post-install-cmd` and `scripts.post-update-cmd`. Either can be a single string or an array of strings. Each entry is one of three things:

- A literal command, for example `"@php artisan boost:update --ansi"`.
- A reference to another composer script, `"@scriptname"`. Resolve it via `scripts["scriptname"]`, then inspect that value the same way, recursively. A project often wraps the actual Boost call inside a `deploy`, `setup`, or similarly named script called from `post-update-cmd`, rather than calling `boost:update` directly.
- A call to an external script file, for example `"bash scripts/post-update.sh"`, `"./bin/deploy.sh"`, or `"php scripts/setup.php"`. Read that file too, and trace any further references it makes the same way, recursively.

Search all of these, direct and resolved, for a call to `artisan boost:install` or `artisan boost:update`. Allow for a Sail-style `vendor/bin/sail artisan` wrapper, matching whatever form step 6 already found.

- Found inside `composer.json` itself: insert `"npx agenteq sync --yes"` as a new entry, immediately after the Boost call, in whichever array actually contains it, the top-level hook or a resolved nested script. Composer already runs array entries in order, so this alone gives the required sequence, Boost first, then agenteq. Do not combine the two into one `&&` line.
- Found inside an external script file: add `npx agenteq sync --yes` as its own line in that file, right after the Boost call. Match the file's own language and existing style, a bare shell line in a bash script, the same function a PHP script already uses elsewhere to run a shell command, for example `shell_exec`, `passthru`, or `exec`. Do not invent a new invocation style the file does not already use.
- Found nowhere, neither `post-install-cmd` nor `post-update-cmd` calls Boost directly, through a composer script, or through an external file: nothing to extend. Boost's own docs never wire this up automatically, so tell the user nothing was found, and ask whether to add it from nothing. Add it only if they agree, to whichever key they choose, `post-update-cmd` is the more common choice, since `boost:update` itself is most often placed there.

Confirm the change with the user before writing to `composer.json` or an external script file.

## 11. Reconcile Boost-aware git hooks

Look for a git hook whose body calls `artisan boost:install` or `artisan boost:update`, directly or via an intermediate script file, tracing that file the same way step 10 traces composer scripts. Check every hook system a project might use:

- Husky, a `.husky/` directory, or a `"prepare": "husky"` script in `package.json`.
- lefthook, `lefthook.yml` or `lefthook.yaml`.
- simple-git-hooks, a `"simple-git-hooks"` field in `package.json`.
- The pre-commit framework, `.pre-commit-config.yaml`.
- Overcommit, `.overcommit.yml`.
- A plain native hook under `.git/hooks/`.

### 11.1 A Boost-aware hook exists

Extend that same hook with `npx agenteq sync --yes`, placed right after the Boost call, same ordering as step 10. Do not add a second, separate hook for this.

### 11.2 No Boost-aware hook exists

There is no Boost-specific wiring to extend. Still offer a `post-checkout` hook running `npx agenteq sync --yes`. `.ai/` content changes across branches, and checking out a branch with different guidelines, commands, or MCP servers leaves every generated file stale until someone runs `agenteq sync` by hand.

Reuse whichever hook system above the project already uses for anything else, rather than adding a second manager. If the project uses none of them, ask the user which hook manager to install, or whether to skip hook setup entirely. Do not pick one on the user's behalf.

Confirm with the user before adding or changing any hook.

## 12. Clean up superseded artifacts

`agenteq sync` overwrites a file at each agent's target path when the canonical source has a matching file. It never deletes a file that has no counterpart in the canonical source, for example a command file step 7 chose not to keep. List any such file. Ask the user before deleting it. Do not delete anything without asking. This is exactly the kind of leftover content step 4's reconciliation exists to find.

## 13. Report back

Summarize the result in plain terms:

- Which agents came from `boost.json`, and which were detected separately and added.
- How the leftover hand-authored guidelines were reconciled.
- Which MCP servers were reconciled, and whether `laravel-boost` was found, missing, or flagged as specific to one machine.
- Which commands were reconciled.
- What was untracked from git.
- What composer and git hook wiring was found and extended, or offered and declined.
- A reminder that `.ai/skills`, `.ai/guidelines`, and `.ai/rules` stay Boost's own, and that agenteq's sync excludes the `skills` capability for this project.

Keep this summary short. It is a status report, not a new artifact file.

## 14. Reference: native paths and MCP shapes per agent

Treat this table as the mapping agenteq ships today. If `npx agenteq detect --json` shows a capability that contradicts a row here, trust the tool's own output. The table may be out of date. Note the discrepancy to the user rather than picking one silently.

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

A dash means the agent has no support for that capability at all. `command:[cmd,...args]` means the command and its arguments share one array, split them per step 6. `(no type)` means the agent's remote entries carry no `type` field, infer it per step 6. `(no native remote, see mcp-remote note)` means the agent has no remote MCP support at all, see step 6 for how to recognize and reverse the disguised entry.
