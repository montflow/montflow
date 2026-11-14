# Memory

## Context

Reconcile this spec with main after `spec-optimizations` landed and the
phase-directory layout was flattened by the integration merge. This standard
takes precedence: keep sizing, prompts, doctor, and review budgets; restore the
phase tree; delete the hand-written lock list and the reserved review task; make
the CLI and TUI read the derived phase state.

## Progress

- 2026-11-02: complete. Restored the phase tree in `packages/specs` and the
  workspace dashboard, removed the stored lock model, added `migrate`, taught
  the CLI/TUI the tree, and accepted `size: none` on complete records.
- Migrated all 14 specs in the store with the new `migrate` verb (renames only,
  file contents and statuses unchanged). This spec's task directories moved
  with the rest and now sit at
  `montflow-spec-standard/<PHASE>/<PHASE><NNN>-<name>/`.

## Findings

### Git history read

- `3cf8150f` — the completed `montflow-phase-directories` layout (the shape
  restored here).
- `7961378b` / `ae1ee64c` — `spec-optimizations` phases A–H on main.
- `1a7d83ac` — the integration merge that kept the flat side; this is the
  flattening that B001 reverses.
- `0b872fcd` — `mf-<tool>:check` script names read by this task's gates.

### Kept from `spec-optimizations` (main)

- Task `size` and the review-cycle budget (`SIZES`, `REVIEW_CYCLES`,
  `phaseReviewBudget`) plus `sizing.json` and the catalogue.
- The shipped `spec-create` / `spec-execute` / `spec-sizing` prompts, the
  `doctor` payload module and the embedded payload, and the record checks
  (`task.completion-unchecked`, `gate.unchecked`, `task.missing-size`).
- The `author`, `execute`, `sizing-config`, `models`, and `which` verbs and
  their slash/host-tool parity. No later task may re-plan or duplicate them.

### Overridden from main

- The flat `<spec>/<PHASE><NNN>-<name>/` tree is gone; every spec now uses
  `<spec>/<PHASE>/<PHASE><NNN>-<name>/`. `1a7d83ac` must not survive.
- `locked-phases` is no longer parsed, verified, rendered, or scaffolded. The
  `Spec` descriptor has no lock field; a legacy field in a record is ignored
  data, not state.
- The reserved `<PHASE>099-review-phase` task is no longer a structural
  requirement, has no structure check, and is no longer generated: the scaffold
  emits a review task only when a caller requests `type: review`. Existing
  records keep their historical review tasks (this task may not delete another
  task's content), but a phase no longer needs one to verify.
- Lock state is derived only: a phase is complete when every task under it is
  complete; it is locked when it is complete and a review round attributed to it
  has `- Status: closed` in `## Metadata`. `passedPhases` owns that rule.
- `lifecycle` no longer accepts a stored list, no longer rejects a lock prefix,
  and no longer requires locks for `status: complete`. It still rejects a
  complete spec with open tasks and an all-complete spec still marked
  `in-progress`.

### Implementation map

- `structure`: two-level phase walk, per-level allowlist, directory-aware
  snapshot (`kind`), empty/stray phase detection, phase-letter agreement, and
  the existing sizing/budget/record checks. No review-task requirement.
- `spec-store`: snapshot emits directory entries; new `move` and
  `removeDirectory`; review rounds carry `passed`.
- `scaffold`: emits `<PHASE>/<task>/`, validates the phase, omits the lock line,
  and appends no review task; a `review` task is emitted only when requested.
- `cli`: new `migrate --name|--all [--dry-run]`, exported plan/report, slash
  form; `gatedTaskIds`, task lookups, and phase tracing read the nested path;
  `status`/`state` render derived locks; `next` derives the active phase.
- `tui`: the picker lists only directories containing `SPEC.md`, with a test
  over a store that holds phase and task directories.
- `apps/workspace`: snapshot carries directories, filters specs by `SPEC.md`,
  and derives locks the same way.

### `size: none`

- `none` is a declared value only on a `complete` task. `verifyTaskSize` accepts
  it there, errors with `task.size-none-unfinished` on any unfinished task, and
  the missing-size fix now points at `none` (or a real size).
- `sizeOf` returns `undefined` for `none`, so `status`, `next`, `resolve`, and
  `sizing` resolve no model and contribute zero review budget. Tests cover both
  acceptance and rejection.

### Migration

- Order: plan from the flat snapshot, move each task directory into its phase
  directory, verify the migrated snapshot before reporting success. A failed
  move **and a failed post-move verification** reverse every applied move and
  remove the phase directories the run created, so the store is never
  half-migrated. The rollback is one routine (`rollbackMoves`) used by both
  paths. `--dry-run` writes nothing; an already-migrated spec is a verified
  no-op; a mixed tree is refused.
- Migrated specs (14): `cli-version-awareness`, `installation-guide`,
  `model-fallback-alignment`, `montflow-ci-verification`,
  `montflow-multi-reviewer`, `montflow-opencode-migration`,
  `montflow-phase-directories`, `montflow-project-structure`,
  `montflow-references-plugin`, `montflow-references-tui`,
  `montflow-spec-completion-gate`, `montflow-spec-standard`,
  `plugin-host-integration`, `spec-optimizations`.
- Fixtures were migrated with the same verb
  (`packages/specs/fixtures/.agents/@montflow/specs`, six fixtures).

## Gates

All commands run from the repo root on 2026-11-02.

### `bun run ts:check`

Exit code: 0. Output tail:

```
 Tasks:    16 successful, 16 total
Cached:    13 cached, 16 total
```

### `bun run lint:check`

Exit code: 0. Output tail:

```
@montflow/specs:lint:check: Found 0 warnings and 0 errors.
 Tasks:    16 successful, 16 total
```

### `bun run fmt:check`

Exit code: 0. Output tail:

```
 Tasks:    16 successful, 16 total
Cached:    16 cached, 16 total
  Time:    23ms >>> FULL TURBO
```

### `bun run mf-specs:check`

Exit code: 0. Output tail:

```
14 specs · 0 failed · 0 issues · 395 warnings
$ bun run src/apps/cli/main.ts doctor --check --dir /home/daniel/dev/montflow/spec-standard
✓ spec skills and prompts are installed and up to date.
✓ montflow-create-specs: up to date → .../.agents/skills/montflow-create-specs
✓ montflow-find-specs: up to date → .../.agents/skills/montflow-find-specs
✓ spec-create: up to date → .../.agents/@montflow/prompts/spec-create.json
✓ spec-execute: up to date → .../.agents/@montflow/prompts/spec-execute.json
✓ spec-sizing: up to date → .../.agents/@montflow/prompts/spec-sizing.json
```

### Derived-state parity

`mf-specs status`, `state`, and `next` for this spec agree on active phase `B`
and no derived locks (there is no review store in the repo):

```
$ bun run --cwd packages/specs cli state --name montflow-spec-standard --dir "$PWD"
montflow-spec-standard · in-progress · state pending · phase B · locked none

$ bun run --cwd packages/specs cli next --name montflow-spec-standard --dir "$PWD"
state pending · phase B · budget 3
B001  gated  execution  reconcile-main-and-phase-rail  large  inherit
```

### Store check + migration

```
$ bun run --cwd packages/specs cli migrate --all --dir "$PWD"
14 specs · 14 migrated · 0 planned · 0 failed

$ bun run --cwd packages/specs cli check --dir "$PWD"
14 specs · 0 failed · 0 issues · 395 warnings
```

### Grep rails

```
$ rg -n "locked-phases" --glob '!node_modules' .
(no output; exit 1)
```

`rg --hidden` still finds the literal in the spec **records** (`SPEC.md`
frontmatter and historical MEMORY prose) and in this task's own delete/test
text; no live code, prompt, skill, or fixture reader reads it. The spec and
fixture records are data that `migrate` may not rewrite.

```
$ rg -n "099-review-phase" --glob '!node_modules' packages/specs/src packages/specs/prompts packages/specs/skills .agents/@montflow/prompts .agents/skills
(no generator or check; only historical spec records outside those paths)
```

### Rollback fixture

`packages/specs/src/apps/cli/tests/migrate.test.ts` contains
`rolls back the tree when the migrated tree fails verification`: a real file
tree whose task directory lacks `MEMORY.md` is moved, fails `verifySpecTree`,
and is asserted back at its original paths with no `A/` or `A` directory left.
The test runs in `bun run --cwd packages/specs test -- --run`.

### Package tests

```
$ bun run --cwd packages/specs test -- --run
 Test Files  100 passed (100)
      Tests  1393 passed (1393)
Type Errors  no errors
```

Includes the TUI picker test (`src/tests/tui.test.ts`), the size-none tests, the
migrate tests, and the nested structure/scaffold/CLI suites. The workspace specs
suite also passes: `bun run --cwd apps/workspace test -- src/services/specs`
→ `2 passed (2) · 12 passed (12)`.

## Open Questions

- The user's hard limit forbids editing `SPEC.md`, so this spec's record still
  carries `locked-phases: A` and prose naming the old contract. The field is now
  ignored data; the orchestrator may remove it when it next owns the spec file
  (B002 hardens records and is the natural place).
- "Passing review round" is defined as `- Status: closed` in a round's
  `## Metadata`. A waiver's record is still a B004 decision; until then a phase
  with no closed round stays unlocked. The repo has no review store, so this
  spec derives no locks.
- The scaffold no longer appends a review task: the reserved generator,
  `REVIEW_NUMBER`, and `reviewId` are deleted. A review task is emitted only
  when a caller requests `type: review`, and `create --tasks` accepts that type.

## Handoff

- B003 (tiers) and B004 (v2 contract) start from the restored phase tree and the
  derived-state rail, not from main's flat tree.
- B002 can retrofit completed records knowing the checks no longer read locks
  and a complete task may opt out with `size: none`.
- C008 owns any remaining v2 surface parity; this task already routes every
  listed CLI surface and the TUI picker through the tree.

## Deviations

- Did not edit `SPEC.md` (hard limit), so its text still describes the old lock
  list even though no code reads it.
- Did not delete historical task directories, including existing
  `<PHASE>099-review-phase` records; only the requirement and check were
  removed, preserving every record's content and status.
- Deleted the scaffold's reserved review generator (`REVIEW_NUMBER`, `reviewId`,
  and the unconditional append) and taught `create --tasks` an explicit
  `review` type; historical review-task records were kept.
