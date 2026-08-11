---
name: write-typescript-code

description: Layering, vocabulary, export shape, and style conventions for writing TypeScript code in agenteq.
---

# Writing TypeScript Code

States agenteq's TypeScript conventions as rules to apply.

## 1. Layering

Dependency direction is one-way: `console` depends on `modules`, which depends on `infrastructure`, `support`, and `shared`. `console` may also import `infrastructure`, `support`, or `shared` directly, without going through `modules` first. Nothing in `infrastructure`, `support`, or `shared` may import `console` or `modules`.

| Layer | Owns | Test for what belongs here |
|---|---|---|
| `console/` | How a run was invoked: flags, env vars, input-source precedence, prompt permission, output rendering | Would still apply if the domain had a different CLI |
| `modules/agents`, `modules/artifacts` | Domain logic: what a capability is, how detection matches, how config gets merged | Would still be true with no CLI at all |
| `infrastructure/` | Side-effecting wrappers over the outside world: filesystem, git, shell, terminal | Knows nothing about the layers above it |
| `modules/shared/` | Cross-module domain concepts, for example `RunContext` | Needed by more than one module, but still specific to agenteq's problem |
| `support/` | Generic, domain-free library code, for example `CliError`, `expandPath` | Would make sense unchanged in a different application |

Domain modules divide into `actions/`, `entities/`, `services/`, `data-transfer-objects/`, `types/`, `enums/`, `schemas/`, and `definitions/`. See Vocabulary below for what each holds. `console/` divides into `commands/` (one file per subcommand), `commands/concerns/` (console-only IO owned by one command), `actions/` (shared, side-effecting orchestration used by more than one command), `actions/concerns/` (console-only IO owned by a shared Action instead of one command), and `utils/` (grouped pure-ish helpers).

**Module boundary**: cross into another module only through its public surface, an `index.ts`, a registry, or an explicit export. Never reach into another module's `entities/` or `services/` directly. No cycles between modules. Before adding a cross-module dependency, check whether it belongs in `shared/` instead.

---

## 2. Vocabulary

Each folder name is a decision, not a label. Match the code's actual shape to a definition below, then follow that kind's rules.

- **Entity**: owns identity and behavior for one domain concept. A `class`, and a hierarchy when the concept has variants that behave differently.
- **DTO**: an immutable data carrier. Its behavior is limited to derived getters, query methods over its own fields, and `withX()` copies, nothing else. A `class`, all-`readonly` fields, `constructor(options: XOptions)`. A shape with no behavior at all is not a DTO, it's a plain `interface` in `types/`. Pair an interface with a `create{Name}` factory only when construction needs one-time normalization, such as collapsing an optional `string | string[]` into an always-present array. Skip the factory otherwise. A capability needing nothing beyond a path is a bare string field, not its own interface.
- **Service**: reusable domain or infrastructure logic that does not orchestrate a full workflow, an interface onto one resource or concept. An exported `const` object of functions, never a class, named as a noun. Splits into a directory once one file would exceed 150 lines or gains a distinct sub-concept, such as a Strategy family, a set of DTOs, or a set of types. The directory earns its own `index.ts` facade only when one caller drives the split pieces together. Otherwise each piece stays its own default-exported Service.
- **Action**: one discrete, composable unit of work, returning a result. One exported `async function`, stateless beyond its parameters, named `verb{Something}Action`. Lives under a domain module's `actions/` for business work, or under `console/actions/` for application-layer orchestration shared by more than one Command, such as the tail two Commands both run after resolving their own inputs differently. Never inside `console/utils/`, a Utils file is pure-ish helpers, not a side-effecting, multi-step workflow.
- **Concern**: console-only side-effecting IO, print, prompt, or warn, with no business decision inside it. Same shape as an Action, but returns nothing beyond a prompt's answer. Lives under `commands/concerns/` when one Command owns it, or `actions/concerns/` when a shared `console/actions/` Action owns it instead.
- **Stage**: one step of a fixed, ordered pipeline that pipes an immutable payload through a sequence, returning a new payload rather than mutating the one it received. One exported `async function`, named `verb{Something}Stage`, default-exported, signature `(payload: X) => Promise<X>`. Lives under a Service's own `stages/` subdirectory. Not an Action: a Stage's identity is its fixed position in one specific pipeline, not a standalone unit of work another caller could invoke on its own.
- **Command**: registers one CLI subcommand. One file, one exported `registerXCommand(program)`. A second export is allowed only when a sibling Command needs to invoke that exact flow directly.
- **Definition**: a plugin-style config object for one instance of a pluggable concept. One file per instance, exporting a single `new Entity({...})`.
- **Strategy**: one implementation among several interchangeable ones behind a shared interface, usually looked up by key from a `Record<Key, Strategy>`. An exported `const`, not a Service: an object when the shared interface has more than one member, the same shape as a Service, or a plain function when it has exactly one. Never wrap a single-method interface in an object just to match the multi-method case.

**Rule of thumb**: one discrete operation returning a result is an Action. Logic reused across callers, or a wrapper around a resource, is a Service. Terminal IO with no business decision inside it is a Concern. One of several interchangeable implementations behind a lookup table is a Strategy. One fixed step in an ordered pipeline is a Stage.

---

## 3. Parameters

A Service or Action called from outside its own file takes a single options object. Never multiple positional parameters at an external call site. Internal, unexported helpers may take positional parameters freely.

The parameter itself stays a plain `options` identifier in the signature. It is destructured on its own line at the top of the body, never inline in the parameter list. This is enforced by the `local/require-options-destructure-in-body` ESLint rule, autofixable with `npm run lint -- --fix`.

---

## 4. Export convention

**Default export** marks an artifact imported and used by identity: instantiated, invoked directly, or listed into a registry. That covers **Entity, Action, Definition, Service** (including a Service's own `index.ts`).

**Named export** marks a data shape, a console-layer concern, or an implementation swapped in by a lookup table rather than imported by name. That covers **DTO, Concern, Command, Strategy, Error, Schema, Enum, a standalone constant**.

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

An `XOptions` interface used only by its file's artifact stays a named export alongside the main export, regardless of the main export's own kind.

---

## 5. Multi-export files

One artifact belongs to one file. Three kinds intentionally group several exports in one file instead:

1. **Utils files** (`support/utils/*`, `console/utils/*`): grouped pure helpers plus the option and return types they need.
2. **A directory's `types/` files**: types shared by several sibling files in that directory, split by cohesive group rather than combined into one `index.ts`. Combine two types in one file only when one is derived directly from the other, its parameter shape, or a type alias built from it. Not merely because sibling files happen to use both.
3. **Command files**: a second export beyond `registerXCommand`, only when a sibling Command needs that exact flow. Not a license for an unrelated second helper. A helper with no external caller stays unexported.

Every other kind holds exactly one exported artifact plus its own `XOptions` interface(s). A second, unrelated concern moves to its own file instead of riding along.

---

## 6. Style rules

- `strict: true`, plus `typescript-eslint`'s `strictTypeChecked` and `stylisticTypeChecked`.
- Path aliases (`@agents/*`, `@artifacts/*`, `@shared/*`, `@support/*`, `@infrastructure/*`, `@console/*`) are the module boundary, not a shortcut. A relative import crossing a module line is a smell.
- `object-shorthand`: never. Every object literal spells out `key: value`.
- Object literal keys are alphabetized. This is a manual convention today, not yet an ESLint rule.
- `curly: all`. Every `if`/`for`/`while` gets braces.
- A destructuring pattern never nests. A property that is itself an object gets destructured in its own following statement, enforced by the `local/no-nested-destructuring` ESLint rule, autofixable with `npm run lint -- --fix`.
- A blank line separates a block statement (`if`, `for`, `while`, `try`, `switch`) from its neighbors, and separates a `return` from what came before it.
- Boolean names are predicates: `is{Adjective}`, `has{Noun}`, `should{Verb}`, `can{Verb}`. A bare noun or adjective, such as `force` or `verbose`, is not a boolean name.
- A derived, parameterless boolean on a class is a getter, `get isInstalled()`, never a zero-arg method. A predicate that takes a parameter stays a method.
- **File layout**: imports (external, then internal, most-specific path last), then the public export(s), then `Interface & Types`, then `Internal`.
- **Immutability**: DTOs never mutate. A pipeline step returns a new DTO via `withX()`, it never pushes onto an existing field in place.
- **Errors**: domain code throws `CliError(code, message)` for anything a user should be able to search by code. `cli.ts` is the only place that catches. Never log-and-swallow inside a module, throw and let `cli.ts` present it.

---

## 7. Related Skills

- **Comments**: [commenting-standards](../commenting-standards/SKILL.md)
- **Adding a supported agent**: [add-agent-definition](../add-agent-definition/SKILL.md)
- **Adding a sync capability**: [add-capability-stage](../add-capability-stage/SKILL.md)
- **Tests**: [write-tests](../write-tests/SKILL.md)
