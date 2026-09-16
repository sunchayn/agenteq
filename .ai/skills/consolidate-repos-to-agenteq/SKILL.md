---
name: consolidate-repos-to-agenteq

description: Refactors every source repository to agenteq first, using refactor-to-agenteq or add-agenteq-to-boost-project as needed, then consolidates their shared guidelines, skills, commands, and MCP servers into one destination repository. Generalizes shareable content and leaves the rest. Wires every source repository to the destination as an agenteq remote source. Works on any repository, not only ones that already use agenteq.
---

# Consolidating Repositories into One agenteq Remote Source

## 1. What this produces

- Every source repository, refactored to agenteq's canonical structure first, if it was not already. Its own scattered per-agent files are gone. Its own canonical source directory holds its guidelines, skills, commands, and MCP servers.
- A destination repository with `mcp/<name>/config.json`, `commands/**`, `skills/**`, and `GUIDELINES.md` at its root. This is agenteq's remote source layout. It holds the shared content from every source repository, generalized so no single repository owns it. The destination is a pure content source. It never runs `agenteq`. It has no `.ai/`, no `agenteq.json`, and no per-agent generated files.
- Each source repository keeps only its own content. Shareable content moves to the destination. Nothing shareable stays duplicated in two places.
- Every source repository has a named remote source in its canonical source directory's `remote-sources.json`, pointing at the destination. The real `agenteq` CLI does the sync.
- A consolidation report. It lists everything that could not be safely generalized, and how the user resolved each one.

Every path in this document is a placeholder. Replace it with what the user gives you.

## 2. Collect the source repositories

Ask the user for the path to one source repository. Verify it is a git repository: run `git rev-parse --show-toplevel` inside it. Ask for another path. Repeat until the user confirms the list is complete. Do not stop after one repository unless the user confirms that is all of them.

Keep the confirmed list for the rest of this skill. A step that says "for each source repository" iterates over this list, in order.

Track each source repository's progress: agenteq-ready, classified, generalized, consolidated, wired, hooked. Use the session's task or todo tool if one is available. Otherwise, use a plain checklist. A consolidation can span many repositories across steps 5 through 13. The checklist stops one from being silently skipped.

## 3. Collect the destination repository

Ask the user for two things: the local path to build the destination at (it may not exist yet), and the destination's git remote URL.

Check the remote with `git ls-remote <url>`. It must exist and carry no refs, a genuinely empty repository. If it already has commits, stop. Ask the user for a different, empty remote. Step 9 pushes the destination's own content to this remote later. It must not merge with unrelated existing history.

If the local path does not exist yet, create it. Run `git init` inside it, then set the given URL as `origin` with `git remote add origin <url>`. If the local path already exists, confirm it is a git repository. Confirm its `origin`, if any, points at the given URL, or add it if missing. Do not push anything yet. Steps 6 through 8 build the destination locally. Step 9 pushes it once.

Keep this local path for the rest of this skill. Step 12 reuses it as-is when wiring each source repository, instead of cloning it again.

## 4. Decide where the consolidation report lives

Check the repository this skill runs in for an existing AI-artifact convention: a rule in `CLAUDE.md` or a similar file naming a directory such as `.ai/artifacts/`, or an existing directory of that shape. Use it if you find one.

Otherwise, default to `.ai/artifacts/CONSOLIDATION_REPORT_<date>.md`, using today's date, inside the repository this skill runs in. That repository is wherever the user invoked this skill from. It may be a source repository, the destination, or a separate repository used only to orchestrate this run. It is not always the destination from step 3.

Create the file as soon as you decide its location. Give it a short header naming the source repositories and the destination. Append findings as they come up in steps 7 through 11. Do not wait until the end. A long consolidation produces many findings. None should be lost if the session stops partway through.

Use this template for every entry, one per artifact, so every finding is easy to scan and compare:

```markdown
## <source repository>: <artifact type> "<artifact name>"

- Status: could not generalize | kept local by choice
- Reason: <why it resists generalization, or why the user chose to keep it local>
- Decision: pending
- Preview: <a short excerpt of the artifact's content>
```

Fill in `Decision` once step 11 resolves it: migrated as-is, dropped, or generalized after all. Do not leave it at `pending`.

## 5. Make every source repository agenteq-ready

Do not extract artifacts from scattered native per-agent files yourself. Two existing skills already do that reliably. Use them.

For each source repository:

1. Check for `boost.json` at its root. If present, this repository runs Laravel Boost. Choose `add-agenteq-to-boost-project`. Otherwise choose `refactor-to-agenteq`.
2. Install the chosen skill inside this repository: `npx skills add https://github.com/sunchayn/agenteq --skill <chosen-skill-name>`.
3. Tell the user which repository you are about to refactor, and which of the two skills will run. Then invoke that skill and follow its steps to completion, with one exception: skip its hook-setup step entirely. Step 13 of this skill sets up hooks for every repository once, later. Running the other skill's hook step too would add the same hook twice.
4. Note which skill you used and which canonical source directory it chose, `.ai` by default. Later steps need both, and the final report in step 15 does too.

When this step finishes, every source repository has a canonical source directory holding its guidelines, skills, commands, and MCP servers, in agenteq's own shape. Every native per-agent file is gone or gitignored.

## 6. Read each source repository's canonical artifacts

For each source repository, read its canonical source directory directly, the one noted in step 5. No agent detection, no baseline agent choice, no native-format field mapping. The delegated skill already produced this content in agenteq's own shape.

Read:

- `GUIDELINES.md`, if present.
- Every skill directory under `skills/`.
- Every command file under `commands/`.
- Every `mcp/<key>/config.json`, already in the canonical shape:

```json
{
    "$schema": "https://unpkg.com/agenteq/dist/schema/mcp-config.schema.json",
    "key": "<entry key>",
    "type": "stdio | http | sse",
    "config": { }
}
```

Tag each artifact with the source repository it came from. Later steps need this tag to write report entries and resolve conflicts.

## 7. Generalize each extracted artifact

An artifact is safe to move to the destination only if it depends on nothing from its own repository. Check each extracted artifact for:

- Absolute paths, or paths rooted at the repository, that point at a file, directory, or module unique to this repository.
- The repository's own name, or a layout-specific directory name, written as if it applies everywhere.
- A command or script reference, in a skill body, a command file, or an MCP entry's `command`/`args`, that exists only in this repository.

If you can replace the specific reference with a generic description, for example "the project's test suite" instead of a named test directory, rewrite it and keep the artifact. If the artifact's whole value depends on this repository's own structure, for example a skill that walks through one repository's module layout, it cannot be generalized. Do not migrate it.

For every artifact you decide not to migrate, append an entry to the report from step 4: the source repository, the artifact type and name, a short reason it resists generalization, and a content preview. Do not decide yet whether to migrate it as-is or drop it. That decision belongs to step 11.

MCP servers rarely need this rewrite. Their `config` is already just `command`, `args`, `env`, `cwd`, or `url`, `headers`. Still check whether `command` or `args` names a script that exists only in this repository. Log it to the report the same way if so.

While generalizing, compare each artifact's name (a skill's directory name, a command's file name, or an MCP server's key) against every artifact already staged from an earlier repository in this run. Same name, same content: keep one copy. Same name, different content: stop and ask the user how to resolve it. Options: merge the two, keep one repository's version, keep both under distinct names, or drop one. Resolve this now, in conversation. Do not add it to the report. Step 4's report covers content that could not be generalized, not naming conflicts.

## 8. Write the resolved artifacts into the destination

Write every artifact that survived step 7 (generalized, free of naming conflicts) at the destination repository's own root: `mcp/<key>/config.json`, `commands/*.md`, `skills/<name>/`. Merge guideline text into `GUIDELINES.md`. Do not nest any of this under a `.ai/` directory. Do not run `agenteq init` or `agenteq sync` inside the destination. It is a remote source for other repositories to pull from, not a project that syncs its own agents. It needs no `agenteq.json`, no per-agent files, and no gitignore entries for those.

Every MCP server found in every source repository always migrates to the destination. There is no option to keep an MCP server local to one repository. Skills, guidelines, and commands can stay local, step 10 covers when that applies.

## 9. Push the destination

Once every source repository is agenteq-ready, classified, generalized, and written into the destination, commit the destination's `mcp/`, `commands/`, `skills/`, and `GUIDELINES.md`. Suggest a commit message, and ask the user to confirm it or pick something else. Push the commit to the empty remote from step 3.

This must happen before step 12. Every source repository's `remote-source add` needs real, reachable content at that remote URL. It also reuses this same local working copy as its clone. The push must land before any source repository is wired.

## 10. Decide what stays local to each source repository

Some content only makes sense inside its own repository: an artifact step 7 could not generalize, or one the user chooses to keep local even though it could be generalized. Leave that content in the source repository's own canonical source directory. Do not move it to the destination.

Record each item in the report from step 4 as kept local. Recommend it stay that way, since it is tied to this repository's structure. Still ask the user, for each one, whether to generalize and migrate it after all. If yes, run it back through step 7's generalization check. If it survives, write it in through step 8.

## 11. Present the report and resolve what is left

Once every source repository has been through steps 6 through 10, walk the user through the report's "could not be generalized" entries from step 7. Get an explicit decision for each one: migrate it to the destination as-is, with its repository-specific wording, or drop it. A dropped item leaves both the destination and, if flagged for removal, the source repository.

Apply every decision to the destination before step 12. The destination's content must be finished and stable before any source repository wires to it. If a decision changes the destination after step 9's push, commit and push that change too.

## 12. Wire each source repository to the destination

For each source repository:

1. Remove from this repository's canonical source directory anything that migrated to the destination in step 8. Keep only what step 10 decided should stay local. This directory now holds only this repository's own content.
2. Run `npx agenteq remote-source add <name> <destination-git-url> --yes --source-dir <this repository's canonical source directory> --path <destination-local-path>` inside this source repository. Use the exact local path the destination was built at in step 3. This `--path` reuses the already-pushed working copy, instead of cloning the same content again for every source repository. The run is non-interactive, so it selects every capability from the destination by default.
3. Open this repository's `remote-sources.json`. Edit the new entry's `selection` field by hand: the exact subset of skills, commands, and MCP servers, plus the guidelines boolean, this repository should pull in. The previous step's command could not prompt for this, since it runs non-interactively. This file edit is how a repository ends up with less than everything the destination offers. Default to selecting everything. Ask the user only if it's genuinely ambiguous which subset this repository wants.
4. Run `npx agenteq sync --yes` inside this source repository, then confirm the result with `git status`. Step 5 already ran `agenteq init` here, so `sync` reuses its saved agent list. `agenteq sync` prints a warning, plus a `git rm -r --cached <paths>` fix, for any path it just started ignoring that git already tracked, for example a file item 1 above removed and a remote artifact now replaces. Run that fix whenever it appears. Show it to the user first. Never leave that warning unresolved.

## 13. Set up hooks to keep sync current

`.ai/` content, local and remote, changes over time. A stale sync leaves generated per-agent files out of date, until someone runs `agenteq sync` by hand. For every source repository, offer a `post-checkout` git hook running `npx agenteq sync --yes --skip-in-ci`. The destination never runs `agenteq`. It needs no hook.

Reuse whatever hook system a repository already has. Never add a second one:

- Husky, a `.husky/` directory, or a `"prepare": "husky"` script in `package.json`: add or extend `.husky/post-checkout` with `npx agenteq sync --yes --skip-in-ci`.
- lefthook, `lefthook.yml` or `lefthook.yaml`: add a `post-checkout` entry under `commands`, running `npx agenteq sync --yes --skip-in-ci`.
- simple-git-hooks, a `"simple-git-hooks"` field in `package.json`: add `"post-checkout": "npx agenteq sync --yes --skip-in-ci"`. Tell the user to run `npx simple-git-hooks` once, to install it.
- The pre-commit framework, `.pre-commit-config.yaml`: add a local hook with `stages: [post-checkout]`, running `npx agenteq sync --yes --skip-in-ci`.
- Overcommit, `.overcommit.yml`: add a `PostCheckout` hook running the same command.
- A plain native hook, `.git/hooks/post-checkout`: append the sync call to it. Do not overwrite what it already does.

If a repository has none of those, ask the user which hook manager to install, or whether to skip hook setup. Do not choose one for the user. Confirm before adding or changing any hook, in any repository.

## 14. Clean up superseded artifacts

In every source repository, `agenteq sync` overwrites a file at each agent's target path when the canonical source (local or remote) has a matching entry. It never deletes a generated file with no counterpart left in that source, for example a skill directory step 10 chose not to keep anywhere. List anything like that. Ask the user before deleting it.

In the destination, the same risk takes a different form: content this skill wrote in an earlier, interrupted run of step 8, that a later run no longer produces, for example an artifact step 11 dropped. List anything under the destination's `mcp/`, `commands/`, `skills/`, or `GUIDELINES.md` that no artifact from this run accounts for. Ask the user before deleting it. Never delete anything silently. This is exactly the leftover content the earlier steps exist to catch.

## 15. Report back

Summarize the result in plain terms:

- The destination repository and its remote URL.
- Every source repository, which of `refactor-to-agenteq` or `add-agenteq-to-boost-project` made it agenteq-ready, and its remote source name.
- What moved to the destination, and what stayed local to each source repository, with why.
- What was found impossible to generalize, and how the user resolved each one.
- What was untracked from git, and what hooks were added or declined, per repository.
- A pointer to the consolidation report file from step 4, rather than repeating its contents here.

Keep this short. It is a status report, not a new artifact file.

## 16. Reference: what to check before starting

- Confirm `npx skills` and `npx agenteq` both run in each source repository. Neither needs to be pre-installed, `npx` fetches each on demand. The destination never runs either, see step 8.
- A source repository may already be a remote source for another project. That is not a conflict. Step 5's delegated skill, and this skill's own steps, only touch this repository's own canonical source directory. Neither touches `remote-sources.json` entries unrelated to the destination built here.
