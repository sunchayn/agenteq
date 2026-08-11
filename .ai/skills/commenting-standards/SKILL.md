---
name: commenting-standards

description: Comment writing, formatting, and wrapping rules for all TypeScript code in agenteq.
---

# Commenting Standards

These rules apply to every comment written in this codebase.

## 1. Core principle

Comment why, not what. Before writing a comment, ask whether it explains why the code exists or why it works this way, not what the next line does. If it only restates the next line, skip it.

- Do comment: non-obvious decisions, workarounds, and the reasoning behind a choice between two approaches.
- Do not comment: obvious code, or a step-by-step narration of what the next line already says.
- Do not reference a ticket, issue, or the user request. A comment must stand on its own for a future reader who has none of that context.
- Do not reference a previous version of the code, or how this version differs from it. Words like "instead", "now", "no longer", "used to", "previously", or a clause defending an absence ("with no X of its own") are the tell. Before finalizing a comment written or edited during a refactor, check whether it would make sense to someone who has never seen the prior version of the file. If it only parses as a contrast with something removed, cut that clause, or the whole comment, and state only the plain fact that remains. That kind of contrast belongs in a commit message or PR description, never in a docblock.

## 2. Language

- No metaphors, idioms, or narrative framing. Plain, direct language tied to concrete technical facts.
- Name the variables and data structures directly when referring to them, instead of describing them indirectly.
- No colon or semicolon joining two independent clauses. Split into two sentences instead.
- Wrap only at a period or a comma, never mid-sentence.

## 3. Doc blocks versus inline comments

- A class or function doc block is always the expanded multi-line `/** ... */` form, never a single-line `/** ... */`, even when short.
- A doc block stays conceptual: what the function achieves, its contract. It must never mention a specific variable name or a step of the internal control flow. That belongs in an inline comment placed at the line it explains.
- A doc block's prose is at most 4 lines. If the explanation needs more, shorten it or break it into a list.
- An inline comment (`//`) never exceeds 3 lines. If it needs more, shorten it, or move the explanation into the doc block above the function instead.
- The last line of a multi-line comment, block or inline, carries at least 4 words. Rebalance the wrapping rather than leaving a short trailing fragment.

## 4. Current gap

Many files in this codebase are under-commented inline today. Non-obvious branches and decision points, why this order, why this early return, why this fallback, are frequently left unexplained. This is not the target state. Backfill inline why-comments in any file you touch going forward. Do not treat the current sparse state as the pattern to copy.

## 5. Related Skills

- **General TypeScript conventions**: [write-typescript-code](../write-typescript-code/SKILL.md)
