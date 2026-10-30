---
id: C004
name: spec-detection
type: execution
originator: user
size: medium
depends-on:
related-tasks:
status: complete
---

# Task C004: spec-detection

## Type: execution

## Description

Add the mechanical answer to "which spec am I working on?". `mf-specs which`
reads the current branch, extracts the feature name, and matches it to exactly
one spec. `execute` uses the same resolver when no `--name` is given.

## Requirements

- Add `which [--branch <name>] [--dir <path>]`. It prints exactly one spec name
  and nothing else on success. `--branch` overrides detection for tests and CI;
  `--dir` selects the specs root like the other commands.
- Detect the branch without assuming a checkout shape:
  - when `<dir>/.git` is a directory, use it as the git directory;
  - when it is a file, read its `gitdir: <path>` line, resolving a relative path
    against `<dir>`;
  - read `<gitdir>/HEAD`; `ref: refs/heads/<branch>` is the branch, a bare SHA
    is detached and resolves to no branch.
- Parse the branch as `<prefix>/<feature-name>`. Accept a lowercase conventional
  prefix (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`,
  `ci`, `release`, `hotfix`) followed by `/`; the feature name is the remainder.
  Lowercase it and normalize `/` and `_` to `-`.
- Match against every spec directory name that has a `SPEC.md`:
  - an exact normalized match wins;
  - otherwise a unique prefix match, where one name is a prefix of the other,
    wins;
  - zero or two or more matches fail. No fuzzy, edit-distance, keyword, or
    description matching.
- Failures exit non-zero with one agent-first diagnostic: `code` (`SPEC_NO_MATCH`
  or `SPEC_AMBIGUOUS`), the branch read, the specs searched, the candidate list,
  the exact `--name` values that would work, and `next: ask the user`.
- A detached HEAD, a branch without a valid prefix, a missing `.git`, or an
  unreadable `HEAD` all take the same no-match path, naming the reason.
- Add `/specs which` to the slash form and `COMMAND_DESCRIPTION`.
- Tests cover: exact match, unique prefix match, ambiguous prefix, no match,
  branch without prefix, detached HEAD, a `.git` file pointing at a worktree
  gitdir, `--branch`, and a custom `--dir`.
- Keep the resolver pure and reusable: `execute` and the host tool call the same
  function, not a copy.

## Completion

- [ ] From `feat/spec-optimizations`, `bun run --cwd packages/specs cli which --dir "$PWD"` prints `spec-optimizations`
- [ ] A branch that matches two specs exits non-zero and lists both
- [ ] A detached HEAD exits non-zero and says `detached`
- [ ] The worktree `.git` file form is covered by a test
- [ ] `execute` and the host tool reuse the same resolver
- [ ] `bun run --cwd packages/specs test`, `lint:check`, `format:check`, and `ts:check` pass
