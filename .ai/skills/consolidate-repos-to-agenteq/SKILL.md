---
name: consolidate-repos-to-agenteq
description: Refactors every source repository to agenteq first, using refactor-to-agenteq or add-agenteq-to-boost-project as needed, then consolidates their shared guidelines, skills, commands, references, and MCP servers into one destination repository. Generalizes shareable content and leaves the rest. Wires every source repository to the destination as an agenteq remote source. Works on any repository, not only ones that already use agenteq.
---

# Consolidating Repositories into One agenteq Remote Source

## 1. End state

- Every source repository refactored to agenteq's canonical structure, if it was not already. Its scattered per-agent files are gone. Its canonical source directory holds its guidelines, skills, commands, references, MCP servers.
- A destination repository with `mcp/<name>/config.json`, `commands/**`, `skills/**`, `references/**`, `GUIDELINES.md` at its root (agenteq's remote source layout). It holds shared content from every source repository, generalized so no single repository owns it. The destination is a pure content source. It never runs `agenteq`. No `.ai/`, no `agenteq/config.json`, no generated per-agent files.
- Each source repository keeps only its own content. Shareable content moves to the destination. Nothing shareable is duplicated.
- Each source repository has a named remote source pointing at the destination, in its canonical source directory's `agenteq/remote-sources.json`. The real `agenteq` CLI does the sync.
- A consolidation report listing everything that could not be safely generalized, and how the user resolved each.

Every path here is a placeholder. Replace it with what the user gives you.

## 2. Collect source repositories

Ask for the path to one source repository. Verify it is a git repository with `git rev-parse --show-toplevel` inside it. Ask for another path. Repeat until the user confirms the list is complete. Do not stop after one unless the user confirms that is all.

Keep the list. "For each source repository" iterates over it in order.

Track each repository's progress: agenteq-ready, classified, generalized, consolidated, wired, hooked. Use the session's task or todo tool if available, otherwise a plain checklist. Steps 5 through 13 can span many repositories. The checklist prevents silent skips.

## 3. Collect the destination repository

Ask the user for the local path to build the destination at (may not exist yet) and the destination's git remote URL.

Check the remote with `git ls-remote <url>`. It must exist and have no refs (genuinely empty). If it has commits, stop and ask for a different empty remote. Step 9 pushes the destination's content there. It must not merge with unrelated history.

Local path does not exist: create it, run `git init` inside, then `git remote add origin <url>`. Local path exists: confirm it is a git repository, and confirm `origin` points at the URL, or add it. Push nothing yet. Steps 6 through 8 build the destination locally. Step 9 pushes once.

Keep this local path. Step 12 reuses it as-is when wiring each source repository, instead of cloning again.

## 4. Decide where the consolidation report lives

Check the repository this skill runs in for an AI-artifact convention: a rule in `CLAUDE.md` or similar naming a directory like `.ai/artifacts/`, or an existing directory of that shape. Use it if found.

Otherwise default to `.ai/artifacts/CONSOLIDATION_REPORT_<date>.md` with today's date, in the repository this skill runs in. That is wherever the user invoked it: a source repository, the destination, or a separate orchestration repository. Not always the destination from step 3.

Create the file as soon as you decide its location. Add a short header naming the source repositories and destination. Append findings during steps 7 through 11, not at the end. A long consolidation produces many findings, and none should be lost if the session stops.

Template, one entry per artifact:

```markdown
## <source repository>: <artifact type> "<artifact name>"

- Status: could not generalize | kept local by choice
- Reason: <why it resists generalization, or why the user chose to keep it local>
- Decision: pending
- Preview: <a short excerpt of the artifact's content>
```

Fill in `Decision` once step 11 resolves it: migrated as-is, dropped, or generalized after all. Never leave `pending`.

## 5. Make every source repository agenteq-ready

Do not extract artifacts from scattered native per-agent files yourself. Two existing skills do that reliably. Use them.

For each source repository:

1. Check for `boost.json` at its root. Present: it runs Laravel Boost, choose `add-agenteq-to-boost-project`. Absent: choose `refactor-to-agenteq`.
2. Install the chosen skill in this repository: `npx skills add https://github.com/sunchayn/agenteq --skill <chosen-skill-name>`.
3. Tell the user which repository you are about to refactor and which skill will run. Invoke the skill and follow it to completion, except skip its hook-setup step. Step 13 sets up hooks for every repository once. Running the other skill's hook step too would add the same hook twice.
4. Note which skill you used and which canonical source directory it chose (`.ai` by default). Later steps and the step 15 report need both.

After this step, every source repository has a canonical source directory with its guidelines, skills, commands, references, MCP servers in agenteq's shape. Every native per-agent file is gone or gitignored.

## 6. Read each source repository's canonical artifacts

For each source repository, read its canonical source directory (noted in step 5) directly. No agent detection, no baseline agent choice, no native field mapping. The delegated skill already produced agenteq's shape.

Read:

- `GUIDELINES.md`, if present.
- Every skill directory under `skills/`.
- Every command file under `commands/`.
- Every file under `references/`.
- Every `mcp/<key>/config.json`, already canonical. Directory name is the entry key. No separate `"key"` field:

```json
{
    "$schema": "https://unpkg.com/agenteq/dist/schema/mcp-config.schema.json",
    "type": "stdio | http | sse",
    "config": { }
}
```

Tag each artifact with its source repository. Later steps need the tag for report entries and conflict resolution.

## 7. Generalize each artifact

An artifact is safe to move to the destination only if it depends on nothing from its own repository. Check each for:

- Absolute paths, or repository-rooted paths, pointing at a file, directory, or module unique to this repository.
- The repository's own name, or a layout-specific directory name, written as if it applies everywhere.
- A command or script reference (in a skill body, command file, or MCP entry's `command`/`args`) that exists only in this repository.

If a specific reference can become a generic description (e.g. "the project's test suite" instead of a named test directory), rewrite it and keep the artifact. If the artifact's whole value depends on this repository's structure (e.g. a skill walking through one repository's module layout), it cannot be generalized. Do not migrate it.

For each artifact you decide not to migrate, append an entry to the step 4 report: source repository, artifact type and name, short reason, content preview. Do not yet decide whether to migrate as-is or drop. Step 11 decides.

MCP servers rarely need rewriting. Their `config` is just `command`, `args`, `env`, `cwd`, or `url`, `headers`. Still check whether `command` or `args` names a script that exists only in this repository. If so, log it to the report the same way.

A skill's or `GUIDELINES.md`'s `@reference(...)` annotation needs its own check:

- A bare `@reference(path)` or namespaced `@reference(namespace::path)` form travels unchanged. It still resolves once moved, the same way it does in the source repository.
- A remote-qualified `@reference(remote:namespace::path)` form names one specific remote source configured in this source repository. It does not travel. Rewrite it to the bare or namespaced form if the file it points at is being generalized too, or log the whole skill as not generalizable if it cannot be, and say why.
- A skill moves to the destination only together with every reference file it annotates. Generalize and migrate them in the same step. Never migrate a skill while leaving a reference it needs behind.

While generalizing, compare each artifact's name (skill directory name, command file name, MCP server key) against every artifact already staged from earlier repositories in this run. Same name and content: keep one copy. Same name, different content: stop and ask the user. Options: merge, keep one repository's version, keep both under distinct names, or drop one. Resolve now in conversation. Do not add it to the report. The step 4 report covers content that could not be generalized, not naming conflicts.

## 8. Write resolved artifacts into the destination

Write every artifact that survived step 7 (generalized, no naming conflict) at the destination's root: `mcp/<key>/config.json`, `commands/*.md`, `skills/<name>/`, `references/<path>`. Merge guideline text into `GUIDELINES.md`. Do not nest anything under `.ai/`. Do not run `agenteq init` or `agenteq sync` in the destination. It is a remote source for other repositories, not a project syncing its own agents. No `agenteq/config.json`, no per-agent files, no gitignore entries for them.

Writing at the destination's root, with no namespace folder, resolves as root capabilities, the same meaning `.shared` carries once namespace folders exist. Destination already namespaced, or this run adds one. Write under `.shared/` instead of the bare root, so root capabilities group with the namespaces instead of sitting awkwardly next to them. No namespace folders yet. Keep writing at the root.

Every MCP server from every source repository always migrates to the destination. There is no option to keep an MCP server local. Skills, guidelines, commands, and references can stay local (step 10).

## 9. Push the destination

After every source repository is agenteq-ready, classified, generalized, and written into the destination, commit the destination's `mcp/`, `commands/`, `skills/`, `references/`, and `GUIDELINES.md`. Suggest a commit message and ask the user to confirm or pick another. Push to the empty remote from step 3.

Do this before step 12. Each source repository's `remote-source add` needs real reachable content at the remote URL, and reuses this local working copy as its clone. The push must land before any source repository is wired.

## 10. Decide what stays local

Some content only makes sense in its own repository: an artifact step 7 could not generalize, or one the user chooses to keep local though it could be generalized. Leave it in the source repository's canonical source directory. Do not move it to the destination.

Record each item in the step 4 report as kept local. Recommend keeping it local, since it is tied to this repository's structure. Still ask the user, per item, whether to generalize and migrate it after all. If yes, run it through the step 7 check again. If it survives, write it in through step 8.

## 11. Present the report and resolve what is left

After every source repository has been through steps 6 through 10, walk the user through the report's "could not be generalized" entries from step 7. Get an explicit decision for each: migrate to the destination as-is with its repository-specific wording, or drop. A dropped item leaves the destination and, if flagged for removal, the source repository.

Apply every decision to the destination before step 12. The destination must be finished and stable before any source repository wires to it. If a decision changes the destination after the step 9 push, commit and push that change too.

## 12. Wire each source repository

For each source repository:

1. Remove from this repository's canonical source directory anything that migrated to the destination in step 8. Keep only what step 10 decided stays local. The directory now holds only this repository's own content.
2. Run `npx agenteq remote-source add <name> <destination-git-url> --yes --source-dir <this repository's canonical source directory> --path <destination-local-path>` inside this repository. Use the exact local path the destination was built at in step 3. `--path` reuses the already-pushed working copy instead of cloning the same content per repository. The run is non-interactive, so it selects every capability from the destination by default.
3. Open this repository's `agenteq/remote-sources.json`. Edit the new entry's `selection` field by hand: the exact subset of skills, commands, references, MCP servers, plus the guidelines boolean, this repository should pull. The previous command could not prompt for this. This file edit is how a repository ends up with less than everything the destination offers. Default to everything. Ask the user only if the subset is genuinely ambiguous.
4. Run `npx agenteq sync --yes` inside this repository, then confirm the result with `git status`. Step 5 already ran `agenteq init` here, so `sync` reuses its saved agent list. `agenteq sync` warns, with a `git rm -r --cached <paths>` fix, about any newly ignored path that git already tracked (e.g. a file removed in item 1 that a remote artifact now replaces). Run that fix whenever it appears. Show it to the user first. Never leave that warning unresolved.

## 13. Set up hooks to keep sync current

`.ai/` content, local and remote, changes over time. A stale sync leaves generated per-agent files out of date until someone runs `agenteq sync`. For every source repository, offer a `post-checkout` git hook running `npx agenteq sync --yes --skip-in-ci`. The destination never runs `agenteq`, so it needs no hook.

Reuse the repository's existing hook system. Never add a second one:

- Husky (`.husky/` directory, or `"prepare": "husky"` in `package.json`): add or extend `.husky/post-checkout` with `npx agenteq sync --yes --skip-in-ci`.
- lefthook (`lefthook.yml` or `lefthook.yaml`): add a `post-checkout` entry under `commands` running `npx agenteq sync --yes --skip-in-ci`.
- simple-git-hooks (`"simple-git-hooks"` field in `package.json`): add `"post-checkout": "npx agenteq sync --yes --skip-in-ci"`. Tell the user to run `npx simple-git-hooks` once to install it.
- pre-commit framework (`.pre-commit-config.yaml`): add a local hook with `stages: [post-checkout]` running `npx agenteq sync --yes --skip-in-ci`.
- Overcommit (`.overcommit.yml`): add a `PostCheckout` hook running the same command.
- Plain native hook (`.git/hooks/post-checkout`): append the sync call. Do not overwrite existing content.

A repository has none: ask the user which hook manager to install, or whether to skip hooks. Do not choose for them. Confirm before adding or changing any hook, in any repository.

## 14. Clean up superseded artifacts

In every source repository, `agenteq sync` overwrites a file at each agent's target path when the canonical source (local or remote) has a match. It never deletes a generated file with no counterpart left in that source, e.g. a skill directory step 10 chose not to keep anywhere. List such files. Ask the user before deleting.

In the destination the risk differs: content written by an earlier interrupted run of step 8 that a later run no longer produces, e.g. an artifact step 11 dropped. List anything under the destination's `mcp/`, `commands/`, `skills/`, `references/`, or `GUIDELINES.md` that no artifact from this run accounts for. Ask the user before deleting. Never delete silently.

## 15. Report back

Short status summary:

- Destination repository and remote URL.
- Each source repository, which of `refactor-to-agenteq` or `add-agenteq-to-boost-project` made it agenteq-ready, and its remote source name.
- What moved to the destination, what stayed local per source repository, and why.
- What could not be generalized and how the user resolved each.
- What was untracked from git, and hooks added or declined, per repository.
- Pointer to the step 4 report file. Do not repeat its contents.

Not a new artifact file.

## 16. Reference: check before starting

- Confirm `npx skills` and `npx agenteq` run in each source repository. Neither needs pre-installation, `npx` fetches on demand. The destination never runs either (step 8).
- A source repository may already be a remote source for another project. That is not a conflict. Step 5's delegated skill and this skill's steps only touch this repository's canonical source directory. Neither touches `agenteq/remote-sources.json` entries unrelated to the destination built here.
