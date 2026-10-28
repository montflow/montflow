# Memory

## Context

Task C002: generalize the review link to multiple series, one per declared
reviewer profile, and land the per-round `Phase:` grammar with its consumer.
The decisive contract is B001 §2 (series naming: `seriesName` identity,
`profileSeriesName = <spec>-<profile>`, `seriesNames` default-first) and §3
(phase attribution, not phase rank, is the binding identity; `Phase:` is an
optional round-metadata field); B002 §3 (the exact `SeriesRoundSnapshot`/
`SeriesSnapshot`/`ReviewTaskEntry`/`verify` shape, the three issue strings,
`complete`-only scoping, and F17/F18/F20) and §6 (the change-list rows owned by
C002); and B003 §1–§2 (the no-profiles guarantee, the migration note, the
`verify:montflow:specs` series-free guarantee). C001 `TASK.md`/`GATES.md` and
PROGRESS are C001's; C002 implements only its own rows — no C003 dispatch/
`verifySpecProfiles`/`--profile`/`SeriesScaffold.profile`, no C004
`EXECUTING_SPEC`/skill wording.

Implemented in `packages/pi-specs`, `packages/pi-reviews`, and
`apps/workspace`. Read: `review-link.module.ts`, `structure.module.ts`,
`task.module.ts`, `review.module.ts`, `specs.services.module.ts`, the review-
link/structure/execute-flow/verify-round tests, `pi-reviews/package.json`
(exports), and B001/B002/B003 MEMORYs. `bun install` ran (new workspace dep).
No file outside `.agents/@montflow/specs/`, the three sources, and
`apps/workspace/package.json` was touched.

## Progress

- 2026-10-15: complete. C002 gate set green except the pre-existing workspace
  `ts:check`/`test` failures (Findings §5, Deviations).

## Findings

### 1. Review link (`packages/pi-specs/src/modules/review-link/review-link.module.ts`)

- New `SeriesRoundSnapshot { round; phase? }`; `SeriesSnapshot.rounds` widens
  from `ReadonlyArray<string>` to `ReadonlyArray<SeriesRoundSnapshot>`.
- New `ReviewTaskEntry { phase; profiles; complete }` (`profiles` is the
  declared list; `complete` = `status === 'complete'`). `TaskEntry` and
  `reviewPhases` are unchanged (the workspace `buildResumeContext` still
  consumes `reviewPhases`).
- New `profileSeriesName(specName, profile) = `<spec>-<profile>`` and
  `seriesNames(specName, profiles) = [specName, ...profiles.map(profileSeriesName)]`
  — default series first, profiles in declared order. `seriesName` and
  `roundForPhase` are unchanged.
- `verify` replaces the single-snapshot form with
  `(specName, reviewTasks, series: ReadonlyArray<SeriesSnapshot>)`. It binds by
  attribution and is `complete`-only:
  - a non-complete review task requires no round (lets a spec verify before its
    review runs);
  - a `complete` task must have, in each `seriesNames(specName, profiles)`
    series, a round whose `phase === phase`; a series absent from the supplied
    collection → `Phase '<ph>' has a review task but review series '<s>' does
    not exist.`; present with no attributed round → `Phase '<ph>' has a review
    task but series '<s>' has no round attributed to phase '<ph>'.` (both
    `field: 'review-series'`);
  - the attributed round numbers must agree, compared against the first
    attributed series (the default, since it is first in `seriesNames`):
    `Phase '<ph>' is reviewed at round <r1> in '<s1>' but round <r2> in '<s2>'.`
  - supplied series outside the expected set are ignored (the caller may hand
    over a superset). The old name-mismatch check is gone.
- Slug-safety/collision-freeness is unchanged from B001: `seriesNames` of one
  spec can have no internal collision (default differs from every suffixed
  name; distinct profiles yield distinct suffixes); the documented cross-spec
  collision (`spec + profile` composing a sibling spec's default name) is
  accepted and resolved because every caller holds the spec name.

### 2. Structure (`packages/pi-specs/src/modules/structure/structure.module.ts`)

- `verifySpecTree(snapshot, review?: ReadonlyArray<SeriesSnapshot>)` — the
  `review` arg widened from `SeriesSnapshot | undefined` to the collection. At
  the end it builds one `ReviewTaskEntry` per `type === 'review'` task
  (`phase: phaseOf(task.id)`, `profiles: task.reviewerProfiles`, `complete:
  task.status === 'complete'`) and passes the collection to `verifyReviewLink`.
- **F17 preserved:** omitting `review` still skips the cross-store check.
  `mf-specs check` calls `verifySpecTree(snapshot)` with no second argument, so
  `verify:montflow:specs` stays series-free; `pi-specs` still reads no round
  file and imports no `pi-reviews`.

### 3. Round grammar (`packages/pi-reviews/src/modules/review/review.module.ts`)

- New exported `PHASE_ID_PATTERN = /^[A-Z]{1,2}$/`.
- `RoundScaffold.phase?: string`; `renderRound` emits `- Phase: <phase>`
  immediately after `- Round:` only when the phase is set (blank/absent omits
  the line, so standalone rounds and `ROUND_META_FIELDS` are unchanged).
- `parseRound` adds the optional `Phase` validation in the `## Metadata` block:
  a present non-blank value not matching `PHASE_ID_PATTERN` →
  `'Phase' must be a phase id such as 'A' or 'AA' (got '<x>').` The field is
  read through the existing section-scoped `fieldMap` (first-occurrence-wins),
  so the grammar keeps one owner. `verifyRoundFile` inherits the check.
- `authoringRules()` documents the optional `- Phase:` line, so the artifact
  contract stays the single source of truth for the skills.

### 4. Workspace (`apps/workspace/src/services/specs/specs.services.module.ts`)

- `@montflow/pi-reviews` added as `workspace:*` (F20) and loaded lazily
  (`loadPiReviews`, cached alongside `loadPiSpecs`; `resetExtensionCache` now
  clears both), so no new dependency is statically imported at TUI boot.
- `ReviewSeries.rounds` widens to `ReadonlyArray<ReviewSeriesRound>` where
  `ReviewSeriesRound { round; phase? }`.
- `readReviewSeries(root, name, libs, files)` now returns
  `ReadonlyArray<ReviewSeries>`: it parses the spec's `TASK.md` files with
  `libs.Task.parseTaskFile`, collects every `review` task's `reviewerProfiles`
  (deduplicated), names the series with `libs.ReviewLink.seriesNames` — never a
  `name-*` prefix scan (F14) — and reads each series directory. Round dirs are
  filtered by `Review.isValidRound`, round files by `Review.FILE_NAME`, and each
  round's phase is attached with `Review.parseRound(round, raw).metadata['Phase']`
  (F20 — no hand-rolled `## Metadata` match). A series directory that does not
  exist is **omitted**, so the verifier can distinguish "absent" from "present,
  no round"; a missing series never throws.
- `inspect`/`summarize` take `review: ReadonlyArray<ReviewSeries>` and pass it
  straight to `verifySpecTree` (the link check now always runs, with expected
  names derived from the tasks); `readSpecs`, `loadSpec`, and `executeSpec`
  thread the collection and `files`.
- `buildResumeContext` threads `reviewerProfiles` into the task projection and
  renders one line per expected series per review phase, each `(missing)`
  independently. The round shown is still `roundForPhase(phase)` for every
  series (the requirement: an identical round-from-phase-rank mapping across
  series); the header is now
  `Phase reviews (series shares the spec name, one per reviewer profile):`.

### 5. Tests and gates

New/updated tests:

- `review-link.test.ts` (21): `profileSeriesName`/`seriesNames` composition and
  order; slug-valid + collision-free derived names; the accepted cross-spec
  collision; no-profile pass; pending phase requires no round; a `Phase`-less
  round does not satisfy a complete phase; absent series vs present-no-round;
  one extra profile requires both series; two extra profiles raise one issue per
  missing series; a series without the attributed round; disagreeing round
  numbers; a supplied series outside the expected set is ignored; no review
  tasks.
- `verify-spec-tree.test.ts` (18): a complete review with
  `reviewer-profiles: effect-reviewer` backed by both series passes; the same
  tree with only the default series raises one `review-series` issue naming the
  missing profile series.
- `verify-round.test.ts` (12): `renderRound({ phase })` emits `- Phase:` after
  `Round` and round-trips; blank/absent omits; a malformed `Phase` is an issue.
- `execute-flow.test.ts`: the review task can seed `reviewer-profiles` and a
  `complete` status; the detail test asserts the new per-series wording; a new
  profile case asserts both `review-series` issues (default present-but-lacking-
  round, profile series absent); a new resume-context case asserts one line per
  expected series.

Gate results (from the repo root, package scripts only):

- `bun run --cwd packages/pi-specs test` → **pass** — 52 files / 356 tests, no
  type errors.
- `bun run --cwd packages/pi-specs ts:check` → **pass** — `tsc --noEmit`, no
  output.
- `bun run --cwd packages/pi-specs lint:check` → **pass** — 0 warnings, 0 errors.
- `bun run --cwd packages/pi-specs format:check` → **pass** (after one
  `format:fix` on the review-link test).
- `bun run --cwd packages/pi-reviews test` → **pass** — 16 files / 102 tests, no
  type errors.
- `bun run --cwd packages/pi-reviews ts:check` → **pass** — no output.
- `bun run --cwd packages/pi-reviews lint:check` / `format:check` → **pass**
  (extra, because this package's grammar changed).
- `bun run --cwd apps/workspace test -- src/services/specs/tests/execute-flow.test.ts`
  → **pass** — 6 tests (12 across the two matched spec test files).
- `bun run verify:montflow:specs` → **pass** — `4 specs · 0 failed · 0 issues`
  (F17: `check` supplies no collection, so the new link is inert repo-wide).

## Open Questions

- **C003:** dispatch `profile`/`round`/`phase`, `ensureSeries` stamp/merge,
  `SeriesScaffold.profile`/`renderSeries` ledger `Profile:`, the `--profile`
  CLI, and `verifySpecProfiles`/`verifyAll` (F9). C002 deliberately stops at the
  grammar (`RoundScaffold.phase`) and the reader.
- **C004:** `EXECUTING_SPEC` one-session-per-series and the
  `montflow-adversarial-review` wording that writes the exact round and the
  `- Phase:` line.
- **C005:** the `C099` `reviewer-profiles: effect-reviewer` line, the profile
  ledger, and stamping `- Phase: A`/`- Phase: B` onto the existing rounds.

## Handoff

- C003 consumes `ReviewTaskEntry`/`seriesNames` indirectly and owns the write
  path (`SeriesScaffold.profile`, dispatch). C004 consumes `RoundScaffold.phase`
  and the `Phase:` producer. C005 stamps existing rounds. The workspace
  `readReviewSeries` + `verify` collection is the only production consumer of
  the per-round `Phase:` attribution.

## Deviations

- **`authoringRules()` also updated (small addition).** B002 §3's C002 row names
  only `RoundScaffold.phase`/`renderRound`/`parseRound`/`verifyRoundFile`, but
  the round-file sample in `authoringRules()` is the artifact contract injected
  into prompts; leaving it without `- Phase:` would document the grammar
  incorrectly. No test asserts the exact string; the change is additive and
  keeps one source of truth.
- **Profiles deduplicated in `readReviewSeries`.** Two review tasks may declare
  the same profile across phases; deduplication keeps the expected-series read
  list (and the resume-context lines) free of duplicates. Per-task verify is
  unaffected (it uses the task's own declared list). Not contradicted by the
  contract.
- **Pre-existing workspace gate failures, not caused by C002.** Confirmed by
  `git stash` on clean `HEAD`:
  - `bun run --cwd apps/workspace ts:check` fails with
    `Cannot find module '@montflow/format'` from
    `packages/pi-interactive/src/widgets/title/title.widgets.module.ts` — the
    only error, so all C002 workspace files typecheck.
  - `bun run --cwd apps/workspace test` fails 10 pre-existing tests
    (`Prompts extension not found — reinstall the workspace dependencies`) plus
    one unhandled `@montflow/format` TypeCheckError — the same counts on clean
    `HEAD`. The C002 `execute-flow.test.ts` file passes.
- **Incidental file-mode change reverted.** `bun install` set the executable bit
  on `packages/pi-reviews/src/apps/cli/main.ts`; reverted to `100644` so the
  diff carries only intent.
