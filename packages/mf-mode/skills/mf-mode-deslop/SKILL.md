---
name: mf-mode-deslop
description: "Strip AI slop from the code a diff adds, before commit, in any harness: narrating comments, needless guards, type escapes, one-caller wrappers, off-style code and debug leftovers. Behavior stays the same."
id: 822077262eb54848
author: Daniel Montilla
version: 1.0.0
license: MIT
disable-model-invocation: true
---

# When To Use

Run it before every commit in an mf-mode run, over the code you wrote. It works in any harness. In Cursor, `/deslop` does the same pass and can stand in for it.

| Pass | Covers | When |
| --- | --- | --- |
| **mf-mode-deslop** | Code the diff adds | Before commit |
| **mf-mode-no-comments** | Every comment in scope, judged by a reviewer that did not write them | Before review |
| **mf-mode-unslop** | Prose: docs, Markdown, PR bodies, commit messages, replies | Whenever you write prose |

# Pipeline

## 1. Scope

Use the caller's files or diff. Otherwise use the diff against the base branch, default `main`, from the merge base. Include the working tree and untracked files. Touch only lines the diff adds or changes. Skip generated files, lockfiles, vendored code and prose files. Prose goes to **mf-mode-unslop**.

## 2. Read the file

Read the file around each hunk. Note its naming, error handling, comment voice and formatting.

## 3. Remove slop from the added code

- Narrating comments. A comment is slop when it restates the code, talks to the reviewer about the change, or uses a voice the file does not use. Leave every other comment question to **mf-mode-no-comments**.
- Defensive checks, try/catch and fallbacks on values the types or callers already guarantee. Keep guards at system boundaries.
- Casts to `any` and other type escapes: `as any`, `as unknown as T`, `@ts-ignore`, `@ts-expect-error`, non-null `!`, and their equivalents in other languages. Fix the type instead. Keep an escape only when the type system cannot express the truth, and give the reason in the report.
- Wrappers, helpers, options or parameters the change introduced that have one caller. Inline them.
- Style that differs from the file around it.
- Debug output and dead code the diff added.

## 4. Keep behavior

Each edit is a deletion or a rewrite that keeps behavior. If removing something changes what a caller can observe, keep it and report it. Do not fix bugs, rename public symbols, or refactor outside the hunk.

## 5. Run the checks

Run the repo's checks for the touched paths: typecheck, lint, format and tests, scoped the way the repo's AGENTS.md or CLAUDE.md says. Revert or fix any failure this pass caused.

## 6. Report

Report the count per category, each item you kept on purpose with its reason, and each check with its result. "Nothing to strip" is a valid result.

# Reference

- [mf-mode-no-comments](../mf-mode-no-comments/SKILL.md) judges comments before review.
- [mf-mode-unslop](../mf-mode-unslop/SKILL.md) covers prose.
- `mf-mode principles show boundary-discipline` says where guards belong.
- `mf-mode principles show type-system-discipline` covers type escapes.
- `mf-mode principles show minimize-reader-load` covers one-caller wrappers.
