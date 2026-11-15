---
id: A001
name: engine-update-target
type: execution
originator: user
size: large
depends-on:
write-scope: packages/references/src/modules/git/lifecycle.module.ts,packages/references/src/modules/git/git.module.ts,packages/references/src/modules/reference/reference.module.ts,packages/references/src/services/reference-store/reference-store.services.module.ts,packages/references/src/modules/git/tests/,packages/references/src/modules/reference/tests/,packages/references/src/services/reference-store/tests/
related-tasks: A002
status: pending
---

# Task A001: engine-update-target

## Type: execution

## Description

Extend the lifecycle `update` operation (in `GitLifecycleImpl.update`) to
accept an explicit target. Today `update` reads the `ref:` from the entry's
committed `REFERENCE.md` and either checks out that ref (pinned) or follows the
tracked branch (unpinned). This task adds the ability for the caller to specify
a new target: a commit/tag/branch pin (via a `ref` option) or "latest" (via a
`latest` option), which writes the target to `REFERENCE.md` before the existing
refresh runs.

The change happens in three layers:

1. **Git resolution** (`git.module.ts`): add a helper that resolves a commit
   hash (full or abbreviated) against a clone's remote to a full 40-hex id,
   plus helpers to read the commit subject and author date for the wizard and
   for pre-write validation display. This reuses the existing `resolveRef` and
   `lsRemote` where possible and adds a `show`-style commit-metadata reader.

2. **Reference mutation** (`reference.module.ts`): add a helper that takes an
   existing `ReferenceDocument` and a new `ref` value (or absence for `latest`)
   and produces the canonical `REFERENCE.md` bytes with the `ref:` line set or
   removed while preserving the body verbatim.

3. **Lifecycle `update`** (`lifecycle.module.ts`): extend `UpdateOptions` with
   `ref?: string | undefined` and `latest?: boolean | undefined`. When `ref` is
   set, resolve/validate the ref against the remote (fetch first), refusing with
   `refused:` if unresolvable, then write the canonical `REFERENCE.md` (via the
   reference-store `write`) with the new `ref`, leaving the file uncommitted.
   When `latest` is set, write the canonical `REFERENCE.md` with the `ref:`
   field absent (same `write`, uncommitted). Then run the existing refresh
   logic with the new/absent ref. Return the update result, and also surface the
   `REFERENCE.md` change so the CLI can print it as a diff.

The `REFERENCE.md` write uses the existing `ReferenceStore.write` which writes
atomically via a temp file and rename sidecars. The written file is never
`git add`ed; the diff is left uncommitted for review.

## Requirements

- `UpdateOptions` gains `ref?: string | undefined` and `latest?: boolean | undefined`; `ref` and `latest` are mutually exclusive in the engine (a caller that passes both gets a `refused:` usage error).
- A `ref` value of a commit hash (full or 7-40 hex) is resolved against the remote to a full 40-hex id; an abbreviated hash is expanded. An unresolvable hash is `refused:` with `ref does not resolve`.
- A `ref` value of a branch name is resolved against the remote's tracked branch (`refs/remotes/origin/<name>`); an unresolvable branch is `refused:`.
- A `ref` value of a tag name is resolved against the remote's tag refs; an unresolvable tag is `refused:`.
- When `--ref` is set, the existing `ref:` in `REFERENCE.md` is replaced with the new value. When `--latest` is set, the `ref:` line is removed entirely.
- The `REFERENCE.md` write happens only after the ref validates against the remote; an unresolvable ref writes nothing.
- The `REFERENCE.md` change is left uncommitted (never `git add`ed).
- The update result includes enough information for the renderer to print the `REFERENCE.md` diff (old ref / new ref or absence).
- The existing `--force` dirty-clone refusal is preserved: if the clone is dirty and `--force` is not set, `update` refuses before any `REFERENCE.md` write.
- The wizard needs commit metadata (subject and date) for display; the git helper to read that is available at the lifecycle level.
- Every new function in `git.module.ts`, `reference.module.ts`, and `lifecycle.module.ts` carries tests in the corresponding `tests/` directory.

## Completion

- [ ] `UpdateOptions` carries `ref` and `latest`, mutually exclusive.
- [ ] `update` with `--ref <commit|tag|branch>` validates the target against the remote before writing `REFERENCE.md`.
- [ ] `update` with `--latest` removes `ref:` from `REFERENCE.md`.
- [ ] `update` with an unresolvable ref or branch refuses with `refused:` and writes nothing.
- [ ] The `REFERENCE.md` change is left uncommitted.
- [ ] The update result carries the old/new ref for the diff renderer.
- [ ] Dirty-clone `--force` behaviour is preserved.
- [ ] Commit metadata (subject + date) is readable at the lifecycle level for the wizard.
- [ ] New lifecycle/reference/git helpers have unit tests passing.