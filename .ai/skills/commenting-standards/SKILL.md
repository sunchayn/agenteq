---
name: commenting-standards
description: Comment writing, formatting, and wrapping rules for all TypeScript code in agenteq.
---

# Commenting Standards

Applies to every comment in this codebase.

## 1. Core principle

Comment why, not what. Skip a comment that only restates the next line.

- Do comment: non-obvious decisions, workarounds, reasoning behind choosing one approach over another.
- Do not comment: obvious code, step-by-step narration.
- Do not reference a ticket, issue, or user request. A comment must stand alone for a reader with no such context.
- Do not reference a previous version of the code or how this version differs. Tells: "instead", "now", "no longer", "used to", "previously", or a clause defending an absence ("with no X of its own"). After a refactor, check each touched comment makes sense to someone who never saw the old file. If it only parses as a contrast with removed code, cut that clause or the comment, and keep only the plain remaining fact. Contrast belongs in a commit message or PR description.

## 2. Language

- No metaphors, idioms, or narrative framing. Plain language tied to concrete technical facts.
- Name variables and data structures directly.
- No colon or semicolon joining two independent clauses. Use two sentences.
- Wrap only at a period or comma, never mid-sentence.
- Use the existing technical term, not a paraphrase. Write "what tag HEAD is pointing at", not "the tag the branch is sitting on".

## 3. Doc blocks and inline comments

- Class or function doc block: always expanded multi-line `/** ... */`, never single-line, even when short.
- Doc block stays conceptual: what the function achieves, its contract. No variable names, no internal control flow steps. Those go in an inline comment at the line they explain.
- Doc block prose: max 4 lines. Shorten or use a list.
- Inline `//` comment: max 3 lines. Shorten, or move the explanation to the doc block.
- Last line of a multi-line comment, block or inline: at least 4 words. Rebalance wrapping instead of leaving a short trailing fragment.

## 4. Current gap

Many files lack inline why-comments on non-obvious branches and decisions (why this order, early return, fallback). That is not the target state. Backfill why-comments in any file you touch. Do not copy the sparse state.

## 5. Related Skills

- General TypeScript conventions: [write-typescript-code](../write-typescript-code/SKILL.md)
