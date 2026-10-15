---
name: write-typescript-code
description: Layering, vocabulary, export shape, and style conventions for writing TypeScript code in agenteq.
---

# Writing TypeScript Code

## 1. Layering

Dependencies flow one way: `console` -> `modules` -> `infrastructure`, `support`, `shared`. `console` may also import `infrastructure`, `support`, `shared` directly. Nothing in `infrastructure`, `support`, `shared` may import `console` or `modules`.

| Layer | Owns | Belongs here if |
|---|---|---|
| `console/` | How a run was invoked: flags, env vars, input-source precedence, prompt permission, output rendering | Still applies with a different CLI |
| `modules/agents`, `modules/artifacts` | Domain logic: what a capability is, how detection matches, how config merges | Still true with no CLI |
| `infrastructure/` | Side-effecting wrappers over the outside world: filesystem, git, shell, terminal | Knows nothing about layers above |
| `modules/shared/` | Cross-module domain concepts, e.g. `RunContext` | Used by more than one module, specific to agenteq |
| `support/` | Generic domain-free code, e.g. `CliError`, `expandPath` | Works unchanged in another app |

Domain module folders: `actions/`, `entities/`, `services/`, `data-transfer-objects/`, `types/`, `enums/`, `schemas/`, `definitions/`. See Vocabulary.

`console/` folders:
- `commands/`: one file per subcommand.
- `commands/concerns/`: console-only IO owned by one command.
- `actions/`: shared side-effecting orchestration used by more than one command.
- `actions/concerns/`: console-only IO owned by a shared Action.
- `utils/`: grouped pure-ish helpers.

**Module boundary**: cross into another module only through its public surface (`index.ts`, registry, explicit export). Never reach into another module's `entities/` or `services/`. No cycles. Before adding a cross-module dependency, check if it belongs in `shared/`.

---

## 2. Vocabulary

Folder names are decisions. Match the code's shape to a kind below, then follow its rules.

Same for identifiers: use the existing technical term, not a plain-English paraphrase. `headTag`, not `currentBranchTag`.

- **Entity**: owns identity and behavior for one domain concept. A `class`. Use a hierarchy when variants behave differently.
- **DTO**: immutable data carrier. `class`, all-`readonly` fields, `constructor(options: XOptions)`. Behavior limited to derived getters, query methods over own fields, and `withX()` copies. A shape with no behavior is a plain `interface` in `types/`, not a DTO. Pair an interface with a `create{Name}` factory only when construction needs one-time normalization, e.g. collapsing `string | string[]` into an array. A capability needing only a path is a bare string field, not its own interface.
- **Service**: reusable domain or infrastructure logic, not a full workflow. An interface onto one resource or concept. Exported `const` object of functions, never a class, named as a noun. Split into a directory when one file exceeds 150 lines or gains a distinct sub-concept (Strategy family, set of DTOs, set of types). Give the directory an `index.ts` facade only when one caller drives the pieces together. Otherwise each piece stays its own default-exported Service.
- **Action**: one discrete composable unit of work, returning a result. One exported `async function`, stateless beyond parameters, named `verb{Something}Action`. Lives in a domain module's `actions/` for business work, or `console/actions/` for application-layer orchestration shared by more than one Command. Never in `console/utils/`: Utils are pure-ish helpers, not multi-step workflows.
- **Concern**: console-only side-effecting IO (print, prompt, warn), no business decision. Same shape as an Action, returns nothing beyond a prompt's answer. Lives in `commands/concerns/` if one Command owns it, `actions/concerns/` if a shared `console/actions/` Action owns it.
- **Stage**: one step of a fixed ordered pipeline. Takes an immutable payload, returns a new payload, never mutates. One exported `async function`, named `verb{Something}Stage`, default export, signature `(payload: X) => Promise<X>`. Lives in a Service's `stages/` subdirectory. Not an Action: a Stage's identity is its fixed position in one pipeline, not a standalone unit another caller could invoke.
- **Command**: registers one CLI subcommand. One file, one exported `registerXCommand(program)`. A second export only when a sibling Command needs that exact flow.
- **Definition**: plugin-style config object for one instance of a pluggable concept. One file per instance, exporting one `new Entity({...})`. Adding or changing an Agent definition also means updating the reference table in both [refactor-to-agenteq](../refactor-to-agenteq/SKILL.md) and [add-agenteq-to-boost-project](../add-agenteq-to-boost-project/SKILL.md). The table is duplicated in both and hardcodes each agent's paths and MCP shape, because those skills run outside this repo.
- **Strategy**: one of several interchangeable implementations behind a shared interface, usually looked up by key in a `Record<Key, Strategy>`. Exported `const`, not a Service. Object if the interface has more than one member (same shape as a Service). Plain function if exactly one. Never wrap a single-method interface in an object.

**Rule of thumb**:
- One discrete operation returning a result: Action.
- Logic reused across callers, or a resource wrapper: Service.
- Terminal IO, no business decision: Concern.
- One of several implementations behind a lookup table: Strategy.
- One fixed step in an ordered pipeline: Stage.

---

## 3. Parameters

A Service or Action called from outside its own file takes one options object. Never multiple positional parameters at an external call site. Unexported internal helpers may use positional parameters.

Keep the parameter a plain `options` identifier. Destructure it on its own line at the top of the body, never in the parameter list. ESLint rule `local/require-options-destructure-in-body` enforces this. Autofix: `npm run lint -- --fix`.

---

## 4. Export convention

**Default export**: artifact imported and used by identity (instantiated, invoked directly, or listed in a registry). Covers Entity, Action, Definition, Service (including a Service's `index.ts`), Stage.

**Named export**: data shape, console-layer concern, or implementation swapped in by lookup table.

| Kind | Export |
|---|---|
| Entity | default |
| Action | default |
| Definition | default |
| Service | default |
| Stage | default |
| DTO | named |
| Concern | named |
| Command | named |
| Strategy | named |
| Error | named |
| Schema (zod) | named |
| Enum | named |
| Constant | named |
| Utils file | named, several allowed |
| Types file | named, one cohesive group |

An `XOptions` interface used only by its file's artifact stays a named export next to the main export, whatever the main export's kind.

---

## 5. Multi-export files

One artifact per file. Three exceptions:

1. **Utils files** (`support/utils/*`, `console/utils/*`): grouped pure helpers plus their option and return types.
2. **A directory's `types/` files**: types shared by sibling files, split by cohesive group, not one `index.ts`. Combine two types in one file only when one derives directly from the other (its parameter shape, or an alias built from it). Siblings using both is not enough.
3. **Command files**: a second export beyond `registerXCommand` only when a sibling Command needs that exact flow. A helper with no external caller stays unexported.

Every other kind holds one exported artifact plus its own `XOptions` interface(s). Move an unrelated concern to its own file.

---

## 6. Style rules

- `strict: true`, plus `typescript-eslint` `strictTypeChecked` and `stylisticTypeChecked`.
- Path aliases (`@agents/*`, `@artifacts/*`, `@shared/*`, `@support/*`, `@infrastructure/*`, `@console/*`) are the module boundary. A relative import crossing a module line is a smell.
- `object-shorthand`: never. Spell out `key: value`.
- Alphabetize object literal keys. Manual convention, no ESLint rule yet.
- `curly: all`. Braces on every `if`/`for`/`while`.
- Destructuring never nests. Destructure a nested object property in its own following statement. ESLint rule `local/no-nested-destructuring` enforces this. Autofix: `npm run lint -- --fix`.
- Blank line between a block statement (`if`, `for`, `while`, `try`, `switch`) and its neighbors, and between a `return` and what precedes it.
- Boolean names are predicates: `is{Adjective}`, `has{Noun}`, `should{Verb}`, `can{Verb}`. A bare noun or adjective (`force`, `verbose`) is not a boolean name.
- Derived parameterless boolean on a class: getter (`get isInstalled()`), never a zero-arg method. A predicate with a parameter stays a method.
- **File layout**: imports (external, then internal, most-specific path last), public export(s), `Interface & Types`, `Internal`.
- **Immutability**: DTOs never mutate. A pipeline step returns a new DTO via `withX()`, never pushes onto an existing field.
- **Errors**: domain code throws `CliError(code, message)` for anything a user should search by code. Only `cli.ts` catches. Never log-and-swallow in a module. Throw, and let `cli.ts` present it.

---

## 7. Related Skills

- Comments: [commenting-standards](../commenting-standards/SKILL.md)
- Adding a supported agent: [add-agent-definition](../add-agent-definition/SKILL.md)
- Adding a sync capability: [add-capability-stage](../add-capability-stage/SKILL.md)
- Tests: [write-tests](../write-tests/SKILL.md)
- Reverse-engineering tables: [refactor-to-agenteq](../refactor-to-agenteq/SKILL.md), [add-agenteq-to-boost-project](../add-agenteq-to-boost-project/SKILL.md)
