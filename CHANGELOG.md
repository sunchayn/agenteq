# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.0](https://github.com/sunchayn/agenteq/compare/agenteq-v1.0.0...agenteq-v1.1.0) (2026-09-08)

### Added

- **ai:** add `/refactor-to-agenteq` skill ([#1](https://github.com/sunchayn/agenteq/issues/1)) ([67fd45f](https://github.com/sunchayn/agenteq/commit/67fd45fbb54866fb258c1dadc0a597e12f200784))

### Fixed

- **agents:** properly map Junie remote MCP ([#3](https://github.com/sunchayn/agenteq/issues/3)) ([20903ba](https://github.com/sunchayn/agenteq/commit/20903bac7e5ebe6b8fbf1eab159cacdb7b107640))
- **artifacts:** properly git ignore mcp configs ([#2](https://github.com/sunchayn/agenteq/issues/2)) ([a185623](https://github.com/sunchayn/agenteq/commit/a185623914289cd702c3581b297f669e9c770e4c))

## [1.0.0] - 2026-09-06

Initial release. `agenteq` is a single source of truth for AI coding agent configuration. It reads guidelines, MCP servers, skills, and commands from one folder, detects which agents are installed, and writes each one in the format that agent expects.

### Added

- `agenteq detect`, `agenteq init`, and `agenteq sync` commands.
- Sync for four capabilities, guidelines, MCP servers, skills, and commands, each written in the target agent's own format and location.
- Automatic detection of installed coding agents, with a picker to confirm or change the selection.
- Support for 19 coding agents, including Claude Code, Cursor, Codex CLI, Copilot, Windsurf, Zed, and more. See the README for the full list and per-agent capabilities.
- MCP server definitions for `stdio`, `http`, and `sse` server types, with a JSON schema for editor validation and autocomplete.
- `--agents`, `--only`, `--yes`, `--json`, `--source-dir`, and `--debug` flags, each with a matching environment variable for use in CI.
- Sandboxed local testing via `npm run sandbox`, for checking end-to-end behavior without touching a real project.
