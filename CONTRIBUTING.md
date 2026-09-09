# Contributing

## Setup

Requires Node.js 20 or later.

```bash
npm install
```

## Scripts

```bash
npm run build        # builds dist/ and regenerates dist/schema/mcp-config.schema.json
npm run dev          # rebuilds on file changes
npm run typecheck
npm run lint
npm run test
npm run test:coverage
npm run check        # lint, typecheck, and test together, the same checks CI runs
npm run style:check
npm run style:fix    # lint --fix, then formats with prettier
```

## Sandbox mode

`npm run sandbox [-- --agents claude_code,cursor]` builds the CLI, copies `examples/basic/` into a throwaway `.sandbox/` directory, and runs `agenteq sync` against it non-interactively. Use it to check end-to-end behavior without touching a real project.

Without `--agents`, it targets whatever agents are actually detected on your machine. It also points `HOME`/`USERPROFILE` at the sandbox directory, so an agent that reads or writes a config file relative to the user's home directory stays contained to the sandbox instead of touching your real home directory. This mode is not exposed through `npx`.

## Code style and conventions

This repo keeps its own coding guidelines under `.ai/skills/`.

- `.ai/skills/write-typescript-code`, layering rules, vocabulary, export shape, and general style for this codebase.
- `.ai/skills/write-tests`, what to cover and how to structure a test in the Vitest suite.
- `.ai/skills/commenting-standards`, when and how to write comments.
- `.ai/skills/add-agent-definition`, steps for adding support for a new coding agent.
- `.ai/skills/add-capability-stage`, steps for adding a new sync capability beyond mcp, commands, skills, and guidelines.

To generate the AI artifacts locally run `npm run agenteq -- sync`.
