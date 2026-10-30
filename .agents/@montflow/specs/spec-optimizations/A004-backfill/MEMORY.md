# Memory

## Context

- Task A004 `backfill` (spec `spec-optimizations`). Scope: audit every spec under
  `.agents/@montflow/specs/`, add `size` to each task whose status is `pending`,
  `in-progress`, or `blocked` and has no size; leave `complete` tasks unsized.
- Contract read: `packages/specs/src/modules/task/task.module.ts`
  (`verifyTaskFile`): missing size is an error for non-complete statuses
  (`task.missing-size`) and a warning for `complete`. Sizes come from
  `modules/sizing` `SIZES = tiny | small | medium | large`.
- Choice rule, from `spec-creation-orchestrator` profile: size by risk and
  review depth, not line count. Calibration anchors taken from this same spec
  family: docs/moves/reviews = `small`; multi-module code or multi-artifact
  decisions = `medium`; nothing in the family is `large` except a task spanning
  a whole verb set plus migration (only A005 `wire-authoring` is near that line).
- Explicit exclusion honoured: `.agents/@montflow/specs/spec-optimizations/**`
  TASK.md untouched (all 21 already have a size).

## Progress

- Enumerated 118 `TASK.md` files across 6 specs.
- Audit result: 106 tasks are `complete` (all of `montflow-ci-verification`,
  `montflow-multi-reviewer`, `montflow-opencode-migration`,
  `montflow-project-structure`, and phase A of `montflow-spec-standard`).
  21 `spec-optimizations` tasks are sized already. **12 tasks needed a size, all
  in `montflow-spec-standard` (phases B and C)** — every one was `pending`.
  Zero `in-progress`, zero `blocked`, zero already-sized-but-invalid tasks.
- Added one `size:` frontmatter line to each of the 12, immediately after
  `originator:` to match the existing convention in `spec-optimizations`
  TASK.md files. No other field, status, body, or SPEC.md touched.
- Post-edit audit re-run: no non-complete task anywhere lacks `size`.

## Findings — audit table

Only the 12 rows below needed work. `size` before = `none` for all.

| Spec | Task | Type | Status | Size chosen | Why |
| --- | --- | --- | --- | --- | --- |
| montflow-spec-standard | B001-decide-complexity-tiers | planning | pending | small | One decision document: the tier enum, per-tier matrix, and interaction budget all land in one `MEMORY.md`, plus a drift-test specification (not an implementation). Narrow blast radius at write time; B099 reviews it separately. |
| montflow-spec-standard | B002-decide-spec-standard-v2 | planning | pending | medium | Nine coupled decision clusters (tree layout, `PHASE.md`, id scheme, derived locks, gate kinds, version field, migrate rule, board/mailbox grammar, single-writer rule). Every Phase C task implements a rule this doc fixes, so under-specification risk is the highest in the spec. |
| montflow-spec-standard | B003-decide-tooling-contract | planning | pending | medium | Ten generator verbs with signatures plus manifest design, report-only/repair split, payload shipping, and doctor failure behavior. Same breadth as B002, and C004/C005/C006 all consume it. |
| montflow-spec-standard | B099-review-phase | review | pending | small | Read-only review of three decision documents: contradiction and under-specification hunting, no artifact authored. Matches the `small` review sizing used by every `-099` task in this family. |
| montflow-spec-standard | C001-implement-version-and-structure | execution | pending | medium | New phase module (parse + verify), `SPEC.md` version rules, task move/re-numbering, deletion of the reserved review id and the hand-written lock list, plus v1/v2 fixtures and tests. Multi-module with deletions across existing checks. |
| montflow-spec-standard | C002-implement-gate-kinds-and-execution | execution | pending | medium | New `gate run` verb that executes commands and records command/exit/timestamp, gate-kind parsing, `check` integration for unproven gates, removal-free but test-heavy, with existing gate files needing to stay valid. |
| montflow-spec-standard | C003-implement-board-and-mailboxes | execution | pending | medium | New append-only entry grammar enforced by the verifier, a `mail` verb that steers a live session, queueing for non-live targets, and `claim` binding it depends on. Cross-cutting (verifier + CLI + skill text) rather than deep. |
| montflow-spec-standard | C004-implement-doctor-payload-manifest | execution | pending | medium | Per-package manifest across every shipping package, one shared embedded-payload generator wired into builds, report-only parity for every `verify:montflow:*` script, two packages gaining payloads, and four test paths. Wide surface, one coherent mechanism. |
| montflow-spec-standard | C005-implement-mechanical-state-verbs | execution | pending | large | Widest scope in the spec: eight-plus verbs (`new-phase`, `new-task`, `stamp`, `init`, `claim`, `lock`, `state`, `next`, `migrate`), id allocation from disk, dependency-ordered ready set, atomic claim, plus the v1→v2 tree migration. Every other task in the spec is a prerequisite component of this one. Only task here that legitimately spans more than one subsystem end to end. |
| montflow-spec-standard | C006-ship-spec-artifact-payloads | execution | pending | medium | Seven hand-authored artifacts become installed payload, an inline template literal becomes a real verifiable skill, the authoring skill is rewritten for v2, tier files ship as payload, and every reference must resolve. Many files, mostly content authoring, so medium not large. |
| montflow-spec-standard | C007-align-docs-and-artifact-ledger | execution | pending | small | Documentation-only: `AGENTS.md`, package READMEs, wiki pages, artifact ledger, changelogs, and the frozen-v1 rule. No behavior change and no new mechanism; matches how docs tasks are sized elsewhere in this family (`C005-docs-and-profiles`, `D004-docs-and-handoffs` = small). |
| montflow-spec-standard | C099-review-phase | review | pending | medium | Hostile end-to-end review of the whole overhaul: leftover-v1 hunting, delete verification, severity-channel regression check, then actually running the repo-wide gate and a clean-clone install, and re-verifying the two frozen specs. Heavier than a document review (B099), so one step above the usual `small` review. |

Sizes not chosen: `tiny` — no task here is a single-line or single-command change
with no test/review surface. `large` beyond C005 — C004/C006 are wide but
shallow (one mechanism each); C005 is the only task that composes several new
subsystems and a data migration.

## Gate evidence (verbatim)

1. `bun run --cwd packages/specs cli check --dir "$PWD"` (run from repo root):

```
6 specs · 0 failed · 0 issues · 79 warnings
EXIT=0
```

2. `bun run --cwd packages/specs test`:

```
 RUN  v5.0.4 /home/daniel/dev/montflow/spec-optimizations/packages/specs

 Test Files  70 passed (70)
      Tests  644 passed (644)
Type Errors  no errors
   Start at  12:24:03
   Duration  2.05s (import 85%, transform 6%, tests 5%, typecheck 2%, worker 1%)
EXIT=0
```

3. `GATES.md` Stage 0, scoped to `packages/specs`:

```
$ oxfmt --check .
All matched files use the correct format.
FORMAT_EXIT=0

$ oxlint --deny-warnings .
LINT_EXIT=0

$ tsc --noEmit
TS_EXIT=0
```

4. `bun run mf:check:specs` (spec artifacts + doctor freshness):

```
6 specs · 0 failed · 0 issues · 79 warnings
✓ spec skills and prompts are installed and up to date.
✓ montflow-create-pi-specs: up to date → .../.agents/skills/montflow-create-pi-specs
✓ montflow-find-pi-specs: up to date → .../.agents/skills/montflow-find-pi-specs
✓ spec-create: up to date → .../.agents/@montflow/prompts/spec-create.json
✓ spec-execute: up to date → .../.agents/@montflow/prompts/spec-execute.json
EXIT=0
```

## Remaining warnings (79) and why they stay

All 79 are `task.missing-size` **warnings** on `complete` tasks — the contract's
intended state (`verifyTaskFile` returns `warning(...)` for `status: complete`
with no size; SPEC requirement: "a missing size is … a warning for `complete`
tasks, so historical completed work needs no backfill"). They are left unsized
deliberately, per A004's requirements, not overlooked.

Per spec: `montflow-ci-verification` 16, `montflow-multi-reviewer` 14,
`montflow-opencode-migration` 24, `montflow-project-structure` 20,
`montflow-spec-standard` 5 (its four completed phase-A tasks plus
`A004-add-artifact-reference-resolution`), `spec-optimizations` 0 (its completed
tasks A001, A002, A003, B001, C004 already carry sizes).

## Open Questions

- None blocking. One observation for the orchestrator: A004's own `Completion`
  checkbox "Remaining warnings are completed tasks only, and are named in the
  receipt" is satisfied, but the warning volume (79) is high enough that a future
  `status`/`check` UX task may want to collapse them into one line per spec.
  Not in A004's scope; no action taken.

## Handoff

- The 12 files edited are listed in the receipt. Nothing else in the repo was
  touched by this worker; unrelated `git status` entries belong to concurrent
  workers and to earlier phases.
- A099 (phase review) can rely on: every non-complete task in every spec now
  declares one of `tiny | small | medium | large`, and the check exits 0.
- Phase budgets that follow from these sizes (largest non-review budget per
  phase, capped at 3): Phase B of `montflow-spec-standard` = 3 (from the two
  `medium` decisions), Phase C = 3 (from C005 `large`). No phase lost budget.

## Deviations

- `GATES.md` asks for formatting, linting, typecheck, and tests without naming a
  scope. Per root `AGENTS.md` ("always scope verification to the working area")
  they were run as `bun run --cwd packages/specs <script>`, not repo-wide, since
  the only changes are `TASK.md` files verified by the specs package.
- Nothing else. No `sizing.json` added, no model id invented, no SPEC.md, lock,
  status, or other task's file touched, no commit made.
