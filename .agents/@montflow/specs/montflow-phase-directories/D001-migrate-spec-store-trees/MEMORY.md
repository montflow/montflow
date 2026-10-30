# Memory

## Context

Task D001: run the `migrate` verb over the seven existing specs (the five complete
ones, `montflow-spec-standard`, and this spec's own tree). No hand moves.

## Progress

- 2026-10-28: complete. `migrate --all` reported 7 specs / 7 migrated / 0 failed;
  `mf-specs check` reports 0 failed / 0 issues / 0 warnings.

## Findings

### 1. Migration report

| Spec | Tasks | Phases |
| --- | --- | --- |
| `installation-guide` | 12 | A, B, C |
| `montflow-ci-verification` | 16 | A, B, C |
| `montflow-multi-reviewer` | 14 | A, B, C |
| `montflow-opencode-migration` | 24 | A, B, C, D |
| `montflow-phase-directories` | 16 | A, B, C, D |
| `montflow-project-structure` | 20 | A, B, C |
| `montflow-spec-standard` | 17 | A, B, C |

### 2. Rename proof

- `git add -A` then `git diff --cached -M --summary`: 275 renames, every one at
  `(100%)` similarity — zero content changes (measured again at `53695fc`: 275
  renames, 72 added files — 61 in this spec tree, 10 `mock-stray`, 1 migrate
  test).
- `git diff --cached -M --name-status | grep '^M'` under `.agents/@montflow/specs`
  is empty: no existing spec file was modified, only moved.
- `mf-specs list` states match the pre-migration baseline: five complete
  (`installation-guide` 12, `montflow-ci-verification` 16,
  `montflow-multi-reviewer` 14, `montflow-opencode-migration` 24,
  `montflow-project-structure` 20 complete) and two in-progress
  (`montflow-spec-standard` 5 complete / 12 pending,
  `montflow-phase-directories` 8 complete / 8 pending).

### 3. Checks

- `bun run packages/specs/src/apps/cli/main.ts check` — 7 specs, 0 failed, 0
  issues, 0 warnings (the C002 legacy warnings are gone because no flat tree is
  left).
- `bun run mf:check:reviews` was not rerun here; no review artifact changed and
  the phase attribution is unchanged (D099 verifies it).

## Open Questions

- None.

## Handoff

- D002 adds the legacy/stray fixtures and the README matrix; D003 deletes the
  legacy branch.

## Deviations

- `mf:check:reviews` was not part of the D001 run (the store had no series yet);
  it was run after the reviews were dispatched and passes with 8+ files.
