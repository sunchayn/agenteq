# agenteq

[![npm](https://img.shields.io/npm/v/agenteq?style=flat-square)](https://www.npmjs.com/package/agenteq)
[![CI](https://img.shields.io/github/actions/workflow/status/sunchayn/agenteq/ci.yml?style=flat-square)](https://github.com/sunchayn/agenteq/actions)
[![Node.js](https://img.shields.io/badge/Node.js->=20-3c873a?style=flat-square)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![Coverage](https://img.shields.io/codecov/c/github/sunchayn/agenteq?style=flat-square)](https://codecov.io/gh/sunchayn/agenteq)

**A single source of truth for AI coding agents configuration.**<br />
Agenteq reads guidelines, MCP servers, skills, and commands from one canonical source directory, detects installed agents, and generate each relevant artifact in the path/format the agent expects.
It lets you configure everything once, regardless of which agents your collaborators use, and keeps the generated files out of the repo.

![agenteq-gh-hero.png](art/agenteq-gh-hero.png)

[Getting started](#getting-started) • [Migrating an existing repo](#migrating-an-existing-repo) • [Combining a remote source](#combining-a-remote-source) • [Using it with Laravel Boost](#using-it-with-laravel-boost) • [MCP config](#mcp-config) • [Supported agents](#supported-agents)

## Getting started

Add this layout to your repository:

```
.ai/GUIDELINES.md           # one agent-agnostic guidelines/rules document
.ai/mcp/<name>/config.json  # one file per MCP server (see MCP config below)
.ai/commands/**             # slash commands, synced verbatim per agent
.ai/skills/**               # skills, synced verbatim per agent
```

> [!NOTE]
> The `.ai/GUIDELINES.md` holds the rules you want every agent to follow. Agenteq writes a copy for each agent, in that agent's own format and location, for example `AGENTS.md`.

Once the files are in place, run this.

```bash
npx agenteq init
```

This looks at your machine and project, finds which agents are installed, lets you confirm or change the list, and generates the first set of artifacts for each agent.

See [`examples/basic`](/examples/basic) for a basic configuration example.

> [!TIP]
> You can also use agenteq to sync across remote repositories. Check out [this Guide](#combining-a-remote-source).

## Migrating an existing repo

If your repo already has scattered per-agent rules, you don't need to copy that content into `.ai/` by hand. Agenteq ships a skill for that. It will reconcile the scattered files into one source of truth and untrack everything that is not needed anymore.

Install it as a coding agent skill:

```bash
npx skills add https://github.com/sunchayn/agenteq --skill refactor-to-agenteq
```

Then invoke it via `/refactor-to-agenteq`.

See [`examples/refactor-demo`](/examples/refactor-demo) for an example.

## Usage

Agenteq syncs four capabilities. These are guidelines, MCP servers, skills, and commands.

The following commands are available.

```bash
npx agenteq detect
npx agenteq init
npx agenteq sync
```

### agenteq detect

Shows which agents are installed on this system or in this project right now, and which capabilities each one supports.

| Flag     | What it does                                                          |
| -------- | --------------------------------------------------------------------- |
| `--json` | Print the result as JSON instead of a table, so a script can read it. |

### agenteq init

Lets you pick which agents to use, saves that choice, and generates the artifacts for the first time. Agents already detected as installed are pre-checked in the picker, but you can add or remove any of them.

![agenteq-init.png](art/agenteq-init.png)

Run `init` again to change your selection.

### agenteq sync

Generate the artifacts for the agents you already configured.

The first time you run it, with nothing configured, it behaves like `agenteq init`. After that, it picks agents in this order:

1. If you pass `--agents`, sync uses exactly those agents, and saves that choice for next time, the same as `init` would.
2. Otherwise, if you already ran `init` or `sync` before, it will reuse the agent list you chose last time. It does not re-scan your system or ask you anything.
3. Otherwise, `sync` scans your system and project for installed agents. If it finds any, it saves that list for next time and uses it.
4. Otherwise, `sync` found nothing and there is no saved list yet, so it falls back to the `init` flow.

![agenteq-sync.png](art/agenteq-sync.png)

> [!TIP]
> You can add `agenteq sync` to a git hook, running it whenever changes to the canonical source directory (`.ai` by default) are detected.

### Options shared by `init` and `sync`

| Flag                                      | What it does                                                                                                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--agents <a,b>`                          | Skip the picker and use exactly these agents, for example `--agents claude_code,cursor`.<br />Run `agenteq detect` for the exact agent names. Passing it to either `init` or `sync` saves this list as your new configuration. |
| `--only <mcp,commands,skills,guidelines>` | Sync only some of the four capabilities instead of all of them, for example `--only guidelines,skills`.                                                                                                                        |
| `--yes`                                   | Run without prompts.<br />If Agenteq cannot determine what to do automatically, it fails with an error instead.                                                                                                                |
| `--json`                                  | Print the result as JSON instead of a table.<br />This only changes the output format. At a real terminal, the picker still shows unless `--yes` is also passed.                                                               |
| `--source-dir <dir>`                      | The canonical source directory. Defaults to `.ai`. Change this if you keep it elsewhere in your repo.                                                                                                                          |
| `--skip-in-ci`                            | Do nothing when run in a CI environment, instead of running.<br />Useful for a dependency manager or git hook that also runs in CI. CI is detected automatically.                                                              |

Each flag above also has an environment variable equivalent, it might be useful for setting it once in CI:

- AGENTEQ_AGENTS
- AGENTEQ_ONLY
- AGENTEQ_YES
- AGENTEQ_JSON
- AGENTEQ_SOURCE_DIR
- AGENTEQ_SKIP_IN_CI

A CLI flag always overrides its matching environment variable.

The saved choice is stored at `<source-dir>/agenteq.json`. It is per developer and per machine, not shared through git. The first time Agenteq generates it, it also adds the path to `.gitignore`.

> [!TIP]
> In CI, if no agents are configured, no file is saved, and `--agents` is not set, `sync` fails immediately with an error instead. Passing `--agents`, or setting `AGENTEQ_AGENTS`, avoids this.<br />CI is detected automatically, and you can also force this same non-interactive behavior with `--yes` or `--json`.

## Advanced Usage

### Combining a remote source

Alongside your local canonical source directory, you can point Agenteq at any number of named remote git repositories, each with the same layout, `mcp/`, `commands/`, `skills/`, `GUIDELINES.md` at its root. Agenteq combines every source into one set of synced artifacts.

On `local <> remote` collision, local wins and on `remote <> remote` collection, whichever remote was added first wins.

```mermaid
flowchart LR
    R3["Remote Repository 3"] -..-> C
    R2["Remote Repository 2"] -..-> C
    R1["Remote Repository"] ---> C
    L["Local .ai/"] --> C["sync"]
    L -. "Overrides remote on collision" .-> C

    C --> G["Agent guidelines files\n<small>(concatenated, every source in order)</small>"]
    C --> S["Agent skills\n<small>(symlinked)</small>"]
    C --> Cmd["Agent commands\n<small>(symlinked)</small>"]
    C --> M["Agent MCP config files\n<small>(transformed into one file)</small>"]

    G --> D["Distribute to all configured agents\n<small>(Claude, Cursor, Codex, etc.)</small>"]
    S --> D
    Cmd --> D
    M --> D

    classDef source fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:1px;
    classDef optional fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:1px,stroke-dasharray:4 3;
    classDef sync fill:#fde68a,stroke:#b45309,color:#78350f,stroke-width:3px;
    classDef output fill:#dcfce7,stroke:#16a34a,color:#14532d,stroke-width:1px;
    classDef distribute fill:#ede9fe,stroke:#7c3aed,color:#4c1d95,stroke-width:1.5px;

    class L,R1 source
    class R2,R3 optional
    class C sync
    class G,S,Cmd,M output
    class D distribute
```

#### Available commands

```bash
npx agenteq remote-source add <name> <git-url>    # clone it, pick what to sync, attach it to Agenteq
npx agenteq remote-source list                    # list every configured remote source
npx agenteq remote-source update-choices <name>   # change what you previously picked from
npx agenteq remote-source remove <name>           # deattach it from Agenteq
```

| Flag                 | Applies to                                | What it does                                                                                            |
| -------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `--path <dir>`       | `add`                                     | Where to clone the repository, skips the location prompt.                                               |
| `--ignored`          | `add`                                     | Keep the saved configuration out of git, personal to this machine, instead of shared with the project.  |
| `--yes`              | `add`                                     | Run non-interactively; everything found is selected instead of opening the picker (env: `AGENTEQ_YES`). |
| `--json`             | `add`, `list`, `update-choices`, `remove` | Print machine-readable JSON instead of text or a table (env: `AGENTEQ_JSON`).                           |
| `--source-dir <dir>` | `add`, `list`, `update-choices`, `remove` | Canonical source directory (env: `AGENTEQ_SOURCE_DIR`, default: `.ai`).                                 |

> [!NOTE]
> `update-choices` always needs an interactive terminal for its picker.

### Consolidating drifted repos into one remote source

If you already have several repos, each with their own scattered per-agent rules, and you'd rather share one canonical set of guidelines, skills, commands, and MCP servers between them, you don't need to reconcile each one by hand or build the remote source from scratch. Agenteq ships a skill for that. It generalizes what can be shared, leaves what can't, consolidates everything into one destination repo, and wires every source repo to it as a remote source.

Install it as a coding agent skill:

```bash
npx skills add https://github.com/sunchayn/agenteq --skill consolidate-repos-to-agenteq
```

Then invoke it via `/consolidate-repos-to-agenteq`.

## Using it with Laravel Boost

At first glance, you might think that [Laravel Boost](https://github.com/laravel/boost) and Agenteq are doing the same thing. However, they are slightly different and can be combined.

- **Laravel Boost** inspects the packages you actually have installed and generates guidelines and skills content from that. It writes this content into each real agent it is configured for, for example `CLAUDE.md` and `.claude/skills` for Claude Code, and it exposes its own MCP server, `boost:mcp`.
- **Agenteq** takes your own canonical guidelines, commands, skills, and MCP servers, and distributes them into every agent you support.

Therefore, Laravel Boost will generate the proper guidelines for your project and the skills for every configured agent. Then Agenteq run on top of that to distribute the Commands (Boost doesn't sync this) and the [project MCPs](#mcp-config) to all agents.

To make them work together, first install Boost

```bash
php artisan boost:install --guidelines --skills && npx agenteq init --yes
```

then run the sync using this combination

```bash
php artisan boost:update && npx agenteq sync
```

If your project already runs Laravel Boost, you don't need to do anything by hand. Instead, you can use the following skill:

```bash
npx skills add https://github.com/sunchayn/agenteq --skill add-agenteq-to-boost-project
```

Then invoke it via `/add-agenteq-to-boost-project`. It will take care of transforming your project to wire Agenteq on top of Laravel Boost and doing any necessary reconciliation.

### How does it work behind the scenes

Agenteq reads `boost.json`, the file Boost writes naming which agent(s) it targeted, then pipes what Boost generated into its own sync, capability by capability:

- **Guidelines.** Boost's `<laravel-boost-guidelines>` block is appended to `.ai/GUIDELINES.md`'s content, in every agent's own guidelines file. Then git ignore all guidelines.
- **Skills.** Left entirely to Boost. When `boost.json` lists at least one skill, agenteq drops `skills` from its own default capability list, so it never syncs that capability for this project. It still git ignores the relevant skill directories.
- **Commands.** Agenteq takes full control over this.
- **MCP servers.** Agenteq takes full control over this. To enable Laravel Boost MCP, define it yourself under `.ai/mcp/laravel-boost/config.json`, the same way as any other MCP server (see [MCP config](#mcp-config)):

    ```json
    {
        "key": "laravel-boost",
        "type": "stdio",
        "config": { "command": "php", "args": ["artisan", "boost:mcp"] }
    }
    ```

See [`examples/laravel-boost`](/examples/laravel-boost) for a Laravel Boost example.

### Error codes

If a command fails, the error message starts with a code in parentheses, for example `(E_UNKNOWN_AGENT) Unknown agent "foo".`. Search this table for that code to see what it means.

| Code                                 | What it means                                                                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `E_UNKNOWN_AGENT`                    | An agent name you passed, for example to `--agents`, does not match any supported agent. Run `agenteq detect` for the exact names.                                                                                       |
| `E_UNKNOWN_CAPABILITY`               | A capability name you passed to `--only` does not match one of `mcp`, `commands`, `skills`, `guidelines`.                                                                                                                |
| `E_INVALID_MCP_CONFIG`               | A file under `.ai/mcp/<name>/config.json` is not valid JSON, or does not match the shape described below.                                                                                                                |
| `E_INVALID_REMOTE_SOURCE`            | The cloned repository has none of `mcp/`, `commands/`, `skills/`, or `GUIDELINES.md` at its root.                                                                                                                        |
| `E_REMOTE_SOURCE_ALREADY_EXISTS`     | The `remote-source add` was given a name that's already configured. Remove it first, or pick a different name.                                                                                                           |
| `E_REMOTE_SOURCE_URL_ALREADY_EXISTS` | `remote-source add` was given a git url that's already configured under another name. Use that remote, remove it first, or pick a different url.                                                                         |
| `E_REMOTE_SOURCE_CLONE_FAILED`       | The `remote-source add` could not clone the given url, see the printed detail for the underlying git error.                                                                                                              |
| `E_REMOTE_SOURCE_PATH_CONFLICT`      | The clone location already holds something that is not a clone of the same repository. Make sure you are using the same URL as the repo's configure remote (pay attention to SSH vs HTTP). Or pick a different `--path`. |
| `E_REMOTE_SOURCE_NOT_CONFIGURED`     | The `remote-source update-choices <name>` was run with no remote source saved under that name. Run `remote-source add <name> <git-url>` first.                                                                           |
| `E_REMOTE_SOURCE_NEEDS_PROMPT`       | The `remote-source update-choices` needs an interactive terminal for its picker, it cannot run with `--yes` or in CI.                                                                                                    |
| `E_REMOTE_SOURCE_CANCELLED`          | The picker prompt in `remote-source add`/`update-choices` was cancelled.                                                                                                                                                 |

### MCP config

Each `.ai/mcp/<name>/config.json` file describes one MCP server. It has a `key` naming it, a `type`, and a `config` object shaped by that type.

> [!TIP]
> You can point `$schema` at the schema shipped with this package to get validation and autocomplete in your editor.

```json
{
    "$schema": "https://unpkg.com/agenteq/dist/schema/mcp-config.schema.json",
    "key": "example-server",
    "type": "http",
    "config": {
        "url": "https://example.com/mcp",
        "headers": { "Authorization": "Bearer ${TOKEN}" }
    }
}
```

| `type`  | `config` fields                            |
| ------- | ------------------------------------------ |
| `stdio` | `command` (required), `args`, `env`, `cwd` |
| `http`  | `url` (required), `headers`                |
| `sse`   | `url` (required), `headers`                |

Any other field you place under `config` is not rejected. It is copied directly into the file each agent writes, so agent-specific or future MCP options work without needing a schema update.

> [!IMPORTANT]
> Junie has no native `http`/`sse` support, so agenteq rewrites those entries into a stdio call to `mcp-remote` instead. `headers` and any other `config` fields are dropped in that conversion.

## Configuration

### Global option

| Flag      | What it does                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------- |
| `--debug` | Print the full error stack trace to stderr if a command fails unexpectedly. Same as `DEBUG=agenteq`. |

### Supported agents

Not every agent supports every capability. The table below shows what agenteq can write for each one.

| Agent                                                                                 | Guidelines | Skills | Commands | MCP servers |
| ------------------------------------------------------------------------------------- | ---------- | ------ | -------- | ----------- |
| [Amp](https://ampcode.com)                                                            | Yes        | Yes    | No       | Yes         |
| [Antigravity](https://antigravity.google)                                             | Yes        | Yes    | No       | Yes         |
| [Claude Code](https://claude.com/product/claude-code)                                 | Yes        | Yes    | Yes      | Yes         |
| [Cline](https://cline.bot)                                                            | Yes        | Yes    | No       | No          |
| [Cline CLI](https://cline.bot/cli)                                                    | Yes        | Yes    | No       | No          |
| [Codex CLI](https://github.com/openai/codex)                                          | Yes        | Yes    | No       | Yes         |
| [Cursor](https://cursor.com)                                                          | Yes        | Yes    | Yes      | Yes         |
| [Devin](https://devin.ai)                                                             | Yes        | Yes    | No       | Yes         |
| [Factory Droid](https://factory.ai/product/droids)                                    | Yes        | Yes    | Yes      | Yes         |
| [GitHub Copilot](https://github.com/features/copilot)                                 | Yes        | No     | Yes      | Yes         |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli)                         | Yes        | Yes    | No       | Yes         |
| [GitHub Copilot JetBrains](https://plugins.jetbrains.com/plugin/17718-github-copilot) | Yes        | No     | No       | No          |
| [Goose](https://github.com/block/goose)                                               | Yes        | No     | No       | No          |
| [Grok Build](https://docs.x.ai/build/overview)                                        | Yes        | Yes    | No       | Yes         |
| [Junie](https://www.jetbrains.com/junie/)                                             | Yes        | Yes    | Yes      | Yes         |
| [Kilo Code](https://kilo.ai)                                                          | Yes        | No     | No       | Yes         |
| [Kiro](https://kiro.dev)                                                              | Yes        | Yes    | No       | Yes         |
| [OpenCode](https://opencode.ai)                                                       | Yes        | Yes    | Yes      | Yes         |
| [Pi](https://github.com/earendil-works/pi)                                            | Yes        | Yes    | Yes      | No          |
| [Roo Code](https://github.com/RooCodeInc/Roo-Code)                                    | Yes        | No     | No       | Yes         |
| [Windsurf](https://windsurf.com)                                                      | Yes        | No     | Yes      | No          |
| [Zed](https://zed.dev)                                                                | Yes        | Yes    | No       | Yes         |

A "No" here reflects that agent's own conventions, not a limitation of Agenteq. For example, Pi has no MCP support of its own, so Agenteq has nothing to write there.

Detection methods vary by agent. Some rely on a CLI command, others on a project marker files or an install-folder pattern instead. Run `agenteq detect` on your machine to see what is actually installed.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to set up the project locally, the available npm scripts, and the coding conventions this repo follows.
