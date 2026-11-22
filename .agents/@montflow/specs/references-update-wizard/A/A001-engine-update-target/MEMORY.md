# Memory

## Context

A001 extends `GitLifecycleImpl.update` to accept an explicit target: `ref`
(commit/tag/branch pin) or `latest` (remove the `ref:` line and track the
branch), writing `REFERENCE.md` before the existing refresh. Three layers:
git resolution + commit metadata (`git.module.ts`), reference mutation
(`reference.module.ts`), lifecycle update (`lifecycle.module.ts`).

## Progress

- Implemented `GitPort.commitMeta(path, sha)` returning `{ subject, date }`
  via `git show -s --format=%s%x1f%aI`.
- Implemented `Reference.withRef(document, ref)` — sets/removes the `ref` line
  preserving the body verbatim; re-encodable via `encodeReferenceFile`.
- Extended `UpdateOptions` with `ref?` and `latest?`; both set is a `refused`
  usage error. Added `ReferenceDiff` (`old`/`new`) surfaced on update results.
- Inserted target mutation in `update` after dirty-check/fetch: resolves the
  ref against the remote (`refused:` + no write when unresolvable), rewrites
  `REFERENCE.md` via `store.write` (never `git add`ed), then refreshes to the
  effective ref.
- `--force` dirty-clone refusal preserved (dirty check precedes mutation).

## Findings

- `commitMeta`/`withRef`/`UpdateOptions`/`ReferenceDiff` all exported through
  the package index; `ts:check` clean.
- New lifecycle tests pass: `--ref` pins a commit and checks it out detached;
  `--latest` removes the ref line and fast-forwards the branch; unresolvable
  `--ref` refuses with nothing written; `--ref`+`--latest` refused. New
  `withRef` unit test passes.
- PRE-EXISTING failure (not mine): `GitLifecycle sync > repairs a stale
  origin/HEAD after an upstream default-branch rename` fails with `present`
  vs `ref-mismatch` on git 2.51.2. Proven pre-existing by stashing all my
  source changes — it fails identically on baseline. Out of A001's write-scope;
  not a task requirement.

## Gates

- A001 GATES Stage 0 command runs the full git+reference+store suites; the
  pre-existing sync failure makes the aggregate exit non-zero. All task
  requirement stages pass.

## Open Questions

- None.

## Handoff

- A002 wires the flags/wizard into the CLI surface using this engine layer.

## Deviations

- None.

## Execution

- Read: phase MEMORY Execution Brief, TASK.md/GATES.md, scoped source.
- Write scope: TASK.md files only.
- Record: MEMORY.md at or under 80 lines; logs at /tmp/A001-engine-update-target.log.