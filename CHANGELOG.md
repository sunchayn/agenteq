# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.6.1](https://github.com/sunchayn/agenteq/compare/v1.6.0...v1.6.1) (2026-10-27)


### Fixed

* **cli:** use non-conflicting option for env file ([#72](https://github.com/sunchayn/agenteq/issues/72)) ([eea9416](https://github.com/sunchayn/agenteq/commit/eea94166ebfa84112d4b9ca116c4890bd61a9ae8))

## [1.6.0](https://github.com/sunchayn/agenteq/compare/v1.5.0...v1.6.0) (2026-10-27)

### Added

- **artifacts:** resolve MCP env-file secrets ([#66](https://github.com/sunchayn/agenteq/issues/66)) ([0242fe9](https://github.com/sunchayn/agenteq/commit/0242fe9376026df078a91d0342fcfbac8d13642c))
- **artifacts:** sync remote skills in Boost projects ([#68](https://github.com/sunchayn/agenteq/issues/68)) ([b42f97d](https://github.com/sunchayn/agenteq/commit/b42f97dd27269b55b243ae87f43b31f9b7f4d021))
- **cli:** add `status` command ([#70](https://github.com/sunchayn/agenteq/issues/70)) ([e0169d3](https://github.com/sunchayn/agenteq/commit/e0169d3a18ca6a86c3e251fb56154f33aa16ff76))

### Fixed

- **artifacts:** collapse blank lines in written guidelines to match Boost ([#67](https://github.com/sunchayn/agenteq/issues/67)) ([aaa472a](https://github.com/sunchayn/agenteq/commit/aaa472a1ee20f0e81965a6ac877ff33f2cabd7be))
- **artifacts:** mirror root alias references and scope remote skill scans to selection ([#65](https://github.com/sunchayn/agenteq/issues/65)) ([6e40486](https://github.com/sunchayn/agenteq/commit/6e404863028f2a7510c1b0bb9325a27582cc00e6))

## [1.5.0](https://github.com/sunchayn/agenteq/compare/v1.4.0...v1.5.0) (2026-10-19)

### Added

- **artifacts:** add `copy` mode as a symlink alternative ([#51](https://github.com/sunchayn/agenteq/issues/51)) ([14be6d3](https://github.com/sunchayn/agenteq/commit/14be6d3e6364cba4c03d50bce9240bc32726b150))
- **artifacts:** add `references` capability ([#54](https://github.com/sunchayn/agenteq/issues/54)) ([c83ba08](https://github.com/sunchayn/agenteq/commit/c83ba08096e5b197cc32886577a1d884c442b546))
- **artifacts:** add scriptable selection flags to remote-source ([#48](https://github.com/sunchayn/agenteq/issues/48)) ([60fa959](https://github.com/sunchayn/agenteq/commit/60fa959b5120d093e0dd9b7a6825abca994b4429))
- **artifacts:** allow pinning a remote source ([#41](https://github.com/sunchayn/agenteq/issues/41)) ([ecc2492](https://github.com/sunchayn/agenteq/commit/ecc2492d3780dc77bb191895c3917995a34ae50e))
- **artifacts:** allow selecting future items from remote ([#59](https://github.com/sunchayn/agenteq/issues/59)) ([1694407](https://github.com/sunchayn/agenteq/commit/169440741d6c1c546c4a7022e9a9a4c16f126a72))
- **artifacts:** discover artifacts in remote sub-folders ([#40](https://github.com/sunchayn/agenteq/issues/40)) ([228038b](https://github.com/sunchayn/agenteq/commit/228038be1aa1030822baa0240a05bb634a9a9c72))
- **artifacts:** shared namespace for root-level capabilities ([#52](https://github.com/sunchayn/agenteq/issues/52)) ([e733a3d](https://github.com/sunchayn/agenteq/commit/e733a3d8c66a0d68e19e20c3b5b015b57fd3971f))
- **console:** add --dry-run to sync and init ([#47](https://github.com/sunchayn/agenteq/issues/47)) ([4c0725b](https://github.com/sunchayn/agenteq/commit/4c0725b30afb4a4ed7e69abb70f4981ba645b2a8))

### Fixed

- **artifacts:** detect hand-edited artifacts before sync overwrites them ([#43](https://github.com/sunchayn/agenteq/issues/43)) ([06052d8](https://github.com/sunchayn/agenteq/commit/06052d8b5731b10e509ff81e505246d516d73d36))
- **artifacts:** respect copy mode when mirroring references ([#55](https://github.com/sunchayn/agenteq/issues/55)) ([7e1e93d](https://github.com/sunchayn/agenteq/commit/7e1e93dec9a37750c5c66db2837ee5e00b432a9b))
- **artifacts:** skip placeholder reference annotations silently ([#58](https://github.com/sunchayn/agenteq/issues/58)) ([45d99ae](https://github.com/sunchayn/agenteq/commit/45d99aebb12b8bf69ec62e7d984923fb1990456c))
- track remote local clone in the manifest instead ([#37](https://github.com/sunchayn/agenteq/issues/37)) ([fc1ee7e](https://github.com/sunchayn/agenteq/commit/fc1ee7e7a3de92808e9f45cc0b08de8bf0c95ba1))

## [1.4.0](https://github.com/sunchayn/agenteq/compare/v1.3.0...v1.4.0) (2026-09-16)

### Added

- **artifacts:** support remote repos as a source ([#22](https://github.com/sunchayn/agenteq/issues/22)) ([a0ad78a](https://github.com/sunchayn/agenteq/commit/a0ad78a2b6b30d8c577af0b401458f938c97d77f))

### Fixed

- **git:** don't ignore what is already ignored ([#20](https://github.com/sunchayn/agenteq/issues/20)) ([a05bf2f](https://github.com/sunchayn/agenteq/commit/a05bf2f8078d5558aec939ebe831f1fef89c0cf7))

## [1.3.0](https://github.com/sunchayn/agenteq/compare/v1.2.0...v1.3.0) (2026-09-14)

### Added

- **console:** add `--skip-in-ci` option ([#18](https://github.com/sunchayn/agenteq/issues/18)) ([dffe469](https://github.com/sunchayn/agenteq/commit/dffe469b725db69f79303be0d36c0154c616bcd8))

### Fixed

- safely exit on CI or no-agents env ([#16](https://github.com/sunchayn/agenteq/issues/16)) ([bce46b7](https://github.com/sunchayn/agenteq/commit/bce46b7bcae4bd4d1510261eec1fdb8274942a04))

## [1.2.0](https://github.com/sunchayn/agenteq/compare/v1.1.0...v1.2.0) (2026-09-10)

### Added

- **artifacts:** support `laravel boost` ([#14](https://github.com/sunchayn/agenteq/issues/14)) ([e7e42a7](https://github.com/sunchayn/agenteq/commit/e7e42a7210552bb02bfb36dce220924013a0c639))

## [1.1.0](https://github.com/sunchayn/agenteq/compare/1.0.0...v1.1.0) (2026-09-08)

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
