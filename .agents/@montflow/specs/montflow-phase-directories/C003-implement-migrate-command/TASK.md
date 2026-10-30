---
id: C003
name: implement-migrate-command
type: execution
originator: planner:B099
depends-on: C002
related-tasks:
status: complete
---

# Task C003: implement migrate command

## Type: execution

## Description

Add the one-shot `mf-specs migrate` verb that rewrites a flat spec into the
phase layout without touching file contents. D001 then runs it over the six
repository trees; D003 removes the legacy warning once no flat tree is left. The
fixtures were already moved by hand in C002, so the verb is exercised against a
synthetic flat tree and then against the repository.

## Requirements

- Add a pure planner that turns a flat snapshot into an ordered move list
  `<id>-<name>` → `<phase>/<id>-<name>`, phases sorted by `phaseRank`, and
  returns a refusal for: a mixed tree (root task directories and phase
  directories both present), no task directories at all, and a task directory
  whose name does not parse. `SPEC.md` stays in place and no file content is
  rewritten.
- Add `SpecStore.move(root, name, from, to)` (or the minimal rename surface the
  plan needs) using `FileSystem.rename`, creating the destination phase
  directory first, refusing when the destination task directory already exists,
  and mapping failures to `StoreError`.
- Add the `migrate` CLI command and slash form: `--name <spec>` or `--all`,
  `--dry-run`, `--dir`. It prints one line per move, verifies the migrated
  snapshot with `verifySpecTree`, and reports the result; on `--dry-run` it
  prints the plan and writes nothing.
- Make the command idempotent: an already-migrated spec is a no-op with a
  one-line report, not an error; an unknown spec fails with the store's
  not-found message.
- Add tests: plan for a one-phase and a two-phase tree; refusal for mixed; no-op
  for migrated; dry-run writes nothing; a migrated synthetic tree verifies clean
  and preserves file contents byte for byte.
- Do not migrate the repository or the fixtures here, and add no docs; D001,
  D002, and D004 own those.

## Completion

- [x] `bun run --cwd packages/specs test` passes
- [x] `migrate --dry-run` on a synthetic flat tree prints the full plan and leaves the tree unchanged
- [x] `migrate --name <spec>` on a synthetic flat tree yields a tree with zero issues
- [x] `git diff --stat` on a migrated synthetic tree shows renames only, no content hunks

## GATES

See GATES.md.
