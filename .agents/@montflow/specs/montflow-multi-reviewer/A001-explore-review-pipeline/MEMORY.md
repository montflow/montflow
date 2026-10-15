# Memory

## Context

Task A001: map the full path from a spec phase's `review` task to a written review
round, and record every place the one-reviewer / one-series assumption is encoded.
Evidence gathered from
`packages/pi-specs/src/modules/review-link/review-link.module.ts`,
`packages/pi-specs/src/modules/structure/structure.module.ts`,
`packages/pi-specs/src/modules/task/task.module.ts`,
`packages/pi-specs/src/modules/scaffold/scaffold.module.ts`,
`packages/pi-specs/src/skills/executing-spec.ts`,
`packages/pi-specs/src/modules/prompt/prompt.module.ts`, and on the reviews side
`packages/pi-reviews/src/{extension.ts,apps/dispatch/review-dispatch.apps.module.ts,
apps/cli/{engines,renderers,binary,slash}.apps.module.ts,
modules/review/review.module.ts,
services/{review-store,profile-probe}/*.services.module.ts}` plus their colocated tests.
The sole production caller that supplies a review series to the verifier,
`apps/workspace/src/services/specs/specs.services.module.ts` (and
`apps/workspace/src/services/specs/tests/execute-flow.test.ts`), is recorded at change
point 16.

## Progress

- 2026-10-13: complete.

## Findings

### End-to-end path (spec `review` task → written round)

1. **Task contract.** A phase carries exactly one `review` task (id `<PHASE>099`, name
   `review-phase`, type `review`). Type enum: `TASK_TYPES` / `isReview` in
   `packages/pi-specs/src/modules/task/task.module.ts`; no reviewer/profile field exists on
   `Task` / `TaskInput` / `taskInput` / `verifyTaskFile`. Scaffold emits it from
   `renderReview(phase, id)` in `packages/pi-specs/src/modules/scaffold/scaffold.module.ts`,
   wired at `renderSpecScaffold`.
2. **Orchestrator instruction.** `EXECUTING_SPEC` in
   `packages/pi-specs/src/skills/executing-spec.ts` is injected into the resume session's
   prompt by `buildResumePrompt(name, context)` in
   `packages/pi-specs/src/modules/prompt/prompt.module.ts`. Lines 25–28 tell the
   orchestrator to "spawn an independent session to run `montflow-adversarial-review` …
   write round `<NNN>/REVIEW.md` of the review series that shares the spec's name
   (`.agents/@montflow/reviews/<name>/<NNN>/REVIEW.md`, phase `A` → `001`, `B` → `002`)".
   The orchestrator spawns the reviewer via the `review_create` tool registered in
   `packages/pi-reviews/src/extension.ts` (`pi.registerTool`).
3. **Dispatch.** `review_create` builds a `Dispatch.ReviewDispatchInput` (fields: `root`,
   `name`, `target`, `spec`, `parent`, `model`, `thinking`) and calls
   `Dispatch.startReview(input)` in
   `packages/pi-reviews/src/apps/dispatch/review-dispatch.apps.module.ts`.
   `startReview` runs `ensureSeries(input)` (creates the ledger with
   `Review.renderSeries({name, target, created, rounds: [], findings: []})` after
   `Review.isValidName`), then `Runtime.activeSessionRunnerHost()`, then
   `Session.newId(`${input.name}-review`)`, then `reviewerPrompt(input)`, then
   `sessionRunner.start({root, id, name: 'Review: <name>', prompt, model, thinking, parent,
   spec, tools: ['read','write','edit','bash']})`. It returns `{sessionId, series}`.
4. **Reviewer writes the round.** `reviewerPrompt` instructs the spawned session to load and
   execute `montflow-adversarial-review` for the series and "write the next round under
   `.agents/@montflow/reviews/`". The round/series file paths are realized by
   `ReviewStore` in
   `packages/pi-reviews/src/services/review-store/review-store.services.module.ts`:
   `saveSeries`/`readSeries` → `<root>/.agents/@montflow/reviews/<name>/REVIEW.md`
   (`REVIEWS_SEGMENTS`, `reviewsDir`); `saveRound`/`readRound`/`roundNames` →
   `.../<name>/<round>/REVIEW.md`. Repo-relative paths are produced by `ledgerPath` and
   `roundPath` in `packages/pi-reviews/src/apps/cli/engines.apps.module.ts`.
5. **Series name + round number are pure derivations, not dispatch inputs.**
   `seriesName(specName)` is identity (`specName`), and `roundForPhase(phase)` is
   `String(phaseRank(phase)).padStart(3, '0')` — both in
   `packages/pi-specs/src/modules/review-link/review-link.module.ts`. `phaseRank` lives in
   `task.module.ts`.
6. **Verification link.** `verifySpecTree(snapshot, review?)` in
   `packages/pi-specs/src/modules/structure/structure.module.ts` builds the task map, checks
   each phase has a `review` task (lines 261–268), then when `review` is supplied calls
   `verifyReviewLink(snapshot.name, tasks, review)` (lines 284–292). `review-link.verify`
   computes `expected = seriesName(specName)`, iterates `reviewPhases(tasks)`, and requires
   `roundForPhase(phase)` to be present in the single `SeriesSnapshot.rounds`.

### Change points (single-series / single-profile assumptions)

| # | File | Symbol / field | Assumption to break |
| - | ---- | -------------- | ------------------- |
| 1 | `packages/pi-specs/src/modules/review-link/review-link.module.ts` | `seriesName(specName)` → `specName`; `SeriesSnapshot.name` (a single string); `verify(...)` takes one `series` | One series per spec; must accept a set of expected series (default + one per declared profile) |
| 2 | `.../review-link/review-link.module.ts` | `roundForPhase(phase)`; `SeriesSnapshot.rounds` | One round per phase holds every reviewer's findings; with N series the same rank maps to one round **per** series |
| 3 | `.../review-link/review-link.module.ts` | `reviewPhases(tasks)` — `[...new Set(tasks.filter(type==='review').map(phaseOf))]` | Collapses duplicate `review` tasks in a phase to one phase; a second reviewer's review task is silently dropped, so the verifier never demands its series/round |
| 4 | `packages/pi-specs/src/modules/structure/structure.module.ts` | `verifySpecTree` review-per-phase check (lines 261–268, `.some(phase&&type==='review')`) and the `verifyReviewLink(..., review)` call (lines 284–292) | Only existence is checked; duplicates pass. Call passes one `SeriesSnapshot` |
| 5 | `packages/pi-specs/src/skills/executing-spec.ts` | `EXECUTING_SPEC` text (lines 25–28) | Hard-codes "the review series that shares the spec's name" and a single spawned session per phase |
| 6 | `packages/pi-reviews/src/apps/dispatch/review-dispatch.apps.module.ts` | `ReviewDispatchInput` (no `profile`), `reviewerPrompt`, `ensureSeries`, `startReview` | Dispatch takes no profile; one series, one session (`Session.newId(`${name}-review`)`); `ensureSeries` writes a ledger with no `Profile:` |
| 7 | `packages/pi-reviews/src/extension.ts` | `review_create` tool `parameters` (`name`, `target`, `spec`, `parent`, `model`, `dir`) | Tool surface has no `profile`; one call → one series |
| 8 | `packages/pi-reviews/src/modules/review/review.module.ts` | `SERIES_META_FIELDS = ['Target','Status','Rounds','Created']` (no `Profile`); `parseSeries` reads a single optional `metadata['Profile']` and validates it with `isValidName`; `SeriesScaffold` / `renderSeries` have no profile field; `authoringRules()` documents one optional `- Profile:` | A series ledger carries **at most one** profile (or none) |
| 9 | `packages/pi-reviews/src/apps/cli/engines.apps.module.ts` | `verifySeries` reads the single `ledger.metadata['Profile']` and calls `probe.verify(profile, scope.cwd)`; `scaffold` / `ScaffoldFields` (no profile); `ledgerPath` / `roundPath` | Profile verification assumes one name; scaffold cannot set a profile |
| 10 | `packages/pi-reviews/src/services/profile-probe/profile-probe.services.module.ts` | `ProfileProbe` `verify(name, cwd)` → `runProbe` → `mf-profiles verify <name> --dir <cwd>` | Verifies exactly one profile name |
| 11 | `packages/pi-reviews/src/modules/review/review.module.ts` | `parseFindings` local `seenIds` Set (uniqueness only within one round file); `findingHeading` `/^###\s+(F\d+)\b/`; `parseSeries` validates each index id `/^F\d+$/` but never checks uniqueness across rounds; `renderFindingsTable(rows)` | `F<n>` is a per-round-regex, series-wide-in-practice id space; two reviewers writing into one series collide on F-id and on the ledger index |
| 12 | `packages/pi-specs/src/modules/task/task.module.ts` | `FINDING_REF_PATTERN = /^F\d+$/` and `Task.findingRef` / `taskInput` `finding-ref` | A `defect` task references a finding globally by `F<n>` only — no series/round qualifier, so finding ids must be unique per spec (not per reviewer series) |
| 13 | `packages/pi-specs/src/modules/scaffold/scaffold.module.ts` | `renderReview(phase, id)` and `ScaffoldTask` | Generated review task has no profile list field to emit |
| 14 | `packages/pi-reviews/src/apps/cli/binary.apps.module.ts` | `createFlags`, `createCommand`, `newCommand` — no `--profile` flag | The `Profile:` ledger field can only be hand-edited; `renderers.apps.module.ts` `USAGE` (line 20) advertises `create … [--profile <name>]` but the bin accepts no such flag, and `apps/cli/tests/engines.test.ts` `declareProfile` documents "the field has no CLI flag" |
| 15 | `packages/pi-reviews/src/apps/cli/slash.apps.module.ts` | `parseCliArgs` `create` known set `['target','round','dir']`; `COMMAND_DESCRIPTION` (line 22) and `USAGE` (line 26) list no `--profile` | The slash front end diverges from the bin's `USAGE`: the bin advertises `[--profile <name>]` while the slash parser, `COMMAND_DESCRIPTION`, and slash `USAGE` all omit it, so the two help surfaces already disagree before the flag lands |
| 16 | `apps/workspace/src/services/specs/specs.services.module.ts` (the sole production caller that supplies a series) | `readReviewSeries(root, name)` reads exactly one series named after the spec (`:86-93`); `inspect()` passes one `review` snapshot to `verifySpecTree` (`:221-224`); `buildResumeContext` hard-codes one `${seriesName(id)}/${round}` path per phase under the header "Phase reviews (convention: series shares the spec name)" (`:618-627`); `executeSpec` feeds that context into the resume prompt (`:705-708`); tests `apps/workspace/src/services/specs/tests/execute-flow.test.ts:127,139-142` | The only production caller that hands a `SeriesSnapshot` to `verifySpecTree` assumes one series per spec; multi-reviewer must read one series per expected profile, pass the collection to `verifySpecTree`, and render one path line per series. `mf-specs check` passes no `review` at all (`packages/pi-specs/src/apps/cli/cli.apps.module.ts:104,187`), so no CLI path enforces the link today |
| 17 | `packages/pi-specs/src/apps/cli/cli.apps.module.ts` | `parseScaffoldTask` (`:635-653`, grammar `name[:type[:gates]]`), `scaffold` (`:664-714`, threads `tasks` into `renderSpecScaffold` at `:698-705`), `createCommand` (`:803-843`, no profile flag) | The production producer of `ScaffoldTask` accepts no profile input, so a `renderReview(..., profiles)` change is unreachable through the documented `mf-specs create` surface; tests `src/apps/cli/tests/create.test.ts` must assert the emitted `reviewer-profiles:` line |

### Notes on the two collision mechanics

- **Round file.** Every artifact path is `<series>/<round>/REVIEW.md` and nothing else keys a
  round (`ReviewStore.saveRound`/`readRound`, `engines.roundPath`). A second reviewer writing
  the same phase therefore targets the same file and overwrites it, unless each reviewer owns
  its own series name.
- **Finding id.** `parseFindings`'s `seenIds` set is created per round-file parse
  (`review.module.ts:365`), so it enforces uniqueness only **within one round file**; `F1`
  already repeats across rounds of one series today, and `parseSeries` validates each index
  id against `/^F\d+$/` with no cross-round uniqueness check (`:870`), the series index
  being keyed `Round | ID` (`findingRows`/`renderFindingsTable`, `:953-963`). So `F<n>` is
  **not** unique per spec. Only `defect`'s bare `finding-ref` (`FINDING_REF_PATTERN =
  /^F\d+$/`, `task.module.ts:21`; validated `:256-259`) forces a spec-wide notion of
  identity, and that notion is already ambiguous: a `finding-ref: F1` in a multi-phase spec
  cannot say whether it means round `001`'s or round `002`'s `F1`. Multi-reviewer adds a
  second axis (series), making this worse rather than the same. Per-profile series names do
  **not** make `F<n>` unambiguous — the id space itself must be qualified or partitioned
  (A003 resolves the shape).
- **Exact `SERIES_META_FIELDS`.** It names only required keys; `Profile` is an optional extra
  that `parseSeries` accepts but `renderSeries` never writes. Adding a profile list means
  either extending `SeriesScaffold`/`renderSeries` or keeping one optional `Profile` per
  ledger and splitting reviewers into per-profile series.

## Open Questions

- `renderers.apps.module.ts` `USAGE` lists `--profile` on `create` while neither
  `binary.apps.module.ts` `createFlags` nor `slash.apps.module.ts` accepts it and
  `ScaffoldFields` has no profile field. Whether that line is stale or an intended-but-missing
  flag is unconfirmed from source; A002/A003 should decide if the scaffold must set the profile.
- The F<n> fix shape (per-series ids left unchanged vs. a round/series-qualified reference) is
  not decided here; both satisfy "no collision" but differ in `finding-ref` migration cost.

## Handoff

- Feeds A003 synthesize-multi-reviewer-contract.

## Deviations

- None.
