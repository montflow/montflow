# Memory

## Context

Task A002: delta the unmerged phase-folders prototype (`f17365f`, branch
`feat/phase-folders`) against the current tree. Read-only; nothing was checked
out, merged, rebased, or deleted. Branch head is still `f17365f`.

## Progress

- 2026-10-28: complete. Delta table below.

## Findings

### 1. Prototype summary

- Commit `f17365f` — `wip(specs): prototype phase directories on the pre-opencode tree`,
  147 files changed, 111 renames, +1043 / −274.
- 36 commits behind the current `feat/phase-directories` tip; built on
  `packages/pi-specs`, while the current tree is `packages/specs` with
  `mf-specs create`, `kind`-less snapshots, and the shipped `reviewer-profiles`
  + `review-link` review series.
- Moves every task directory to `<spec>/<PHASE>/<task>/` and rewrites the
  structure verifier around a per-level allowlist.

### 2. Hunk delta

| Prototype hunk | Verdict | Reason / target |
| --- | --- | --- |
| `SpecFileEntry.kind?: 'file' \| 'directory'` and directory entries in `SpecStore.snapshot` | **port** | C001; map onto the current recursive `readDirectory` + `fs.stat` loop |
| Directory-set helper (`directoryPaths`, `parentOf`, `baseOf`) | **port** | C001; declared dirs ∪ file parents keeps file-only callers working |
| Root/phase/task allowlist walk in `verifySpecTree` | **adapt** | C002; current `nest` keeps `severity`/`fix`, prototype rebuilt with `issue()` and lost them |
| Empty-phase-directory finding | **port** | C002; needs directory entries, so C001 first |
| Task-id-letters-must-match-phase-directory finding | **port** | C002 |
| Task directory at the root → "must live inside a phase directory" | **adapt** | C002 as a warning (target path + `fix`), D003 flips it to an error |
| Phase-level file placement hints | **port** | C002 |
| Nested-path rejection | **adapt** | C002; allow exactly three segments |
| `locked-phases` checked against phase *directories* | **port** | C002 |
| One `review` task per phase keyed to directories | **port** | C002 |
| `structure/tests/helpers.ts` directory entry | **port** | C001/C002 |
| 24-case structure test list (see §3) | **adapt** | C002; add the legacy-warning and directory-entry cases |
| `task.module.ts` `review:` and `review-cycles:` fields + patterns + verifier rules + tests | **do not port** | superseded: `reviewer-profiles` + `review-link` own the series contract; `review-cycles` has no current consumer |
| `structure.reviewReferences` + `ReviewReference` | **do not port** | superseded by `modules/review-link` phase attribution |
| `services/review-probe/*` (service, tests, `services/index.ts`, `extension.ts` wiring) | **do not port** | superseded for this layout work; the task→round link is enforced on the workspace path (`apps/workspace`), not by `mf-specs check` — see E004 |
| `skills/authoring-spec.ts` layout + `review:` sentences | **adapt** | D004; port only the layout/allowlist sentences, drop the `review:`/`review-cycles:` sentences |
| `skills/executing-spec.ts` phase-directory read + review protocol | **adapt** | D004; port the phase-directory read sentence only; the review protocol belongs to the reviews package |
| `structure/CONTEXT.md` wording (files and directories) | **port** | D004 |
| `spec-store` and `spec-store` tests | **port** | C001 |
| Skill version `3.0.0` | **port** | D004, both copies + CHANGELOG |
| Moved spec trees for the retired repo's own specs | **do not port** | those specs no longer exist; D001 migrates the current six |

### 3. Structure test coverage baseline (prototype names)

accepts a structurally valid spec; accepts a valid spec that also lists its
directories; fails when SPEC.md is missing; flags a missing TASK.md; flags an
unexpected file at the spec root; flags an unexpected directory at the spec root;
flags a flat legacy task directory at the spec root; flags an unexpected file in
a phase directory; flags an unexpected file in a task directory; flags an
unexpected directory inside a task directory; flags an empty phase directory;
flags a task whose id phase disagrees with its phase directory; flags a
task-table type mismatch; flags a Gates column mismatch; flags a forward-phase
dependency; flags a dependency cycle; flags a phase without a review task; flags
a locked phase with no phase directory; flags a TASK.md at the spec root with
placement guidance; flags a task directory missing its kebab name; flags a
task-table name mismatch; flags invalid GATES.md content; flags a MEMORY.md
missing template sections; flags a complete spec that still has a pending task.

### 4. Deliberate deviations from the prototype

- `nest` keeps the current spread (`{ ...found, field: ... }`) so severity, fix,
  and line survive; the prototype's rebuild-with-`issue` is a regression.
- The legacy flat directory is not an error on landing: it is a warning until
  D001 migrates the six trees and D003 deletes the branch.
- No `review`/`review-cycles`/`ReviewProbe` code, fields, services, or tests.
- Phase directory stays a pure container; no `PHASE.md` (C001 of
  `montflow-spec-standard`).

## Open Questions

- None.

## Handoff

- C001/C002 use §2's port/adapt rows and §3 as the test baseline; D004 uses the
  skill rows; A003 records the split.

## Deviations

- None. `feat/phase-folders` and `f17365f` were not modified.
