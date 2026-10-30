# Memory

## Context

Task B002: decide how a declared reviewer profile drives a spawned reviewer
session and how the verifiers change, so the tooling stays testable without a
running agent session. B001 fixed the review-task field (`reviewer-profiles`),
the derived series naming (`seriesName` / `profileSeriesName` / `seriesNames`),
the phase→round mapping (`roundForPhase`, plus per-round `Phase:` attribution), the
layered unknown-profile reporting, and the `<series>/<round>/F<n>` `finding-ref` locator. B002 turns
those into dispatch mechanics and verifier signatures.

Evidence read in full: `A002-explore-profile-binding/MEMORY.md`,
`A003-synthesize-multi-reviewer-contract/MEMORY.md`, and B001's `MEMORY.md`.
Interface facts re-verified in source before deciding:
`packages/pi-reviews/src/apps/dispatch/review-dispatch.apps.module.ts`
(`ReviewDispatchInput`, `reviewerPrompt`, `ensureSeries` early return at `:75`,
`REVIEW_TOOLS`, `startReview`), `packages/pi-reviews/src/extension.ts`
(`review_create` parameters and execute), `packages/pi-reviews/src/modules/review/review.module.ts`
(`SERIES_META_FIELDS`, `parseSeries`, `renderSeries`, `SeriesScaffold`, `authoringRules`),
`packages/pi-reviews/src/apps/cli/{engines,binary,slash,renderers}.apps.module.ts`
(`scaffold`, `nextRoundNumber`, `createFlags`, `parseCliArgs`, `USAGE`),
`packages/pi-reviews/src/services/profile-probe/profile-probe.services.module.ts`,
`packages/pi-reviews/package.json` (deps: pi-effect, pi-profiles, pi-sessions — the F9
pass adds `@montflow/pi-specs`, §2),
`packages/pi-sessions/src/services/session-runner/session-runner.services.module.ts`
(`SessionRunnerStartInput` has no `skills`; `PiSessionEvent`/start),
`packages/pi-prompts/src/extension.ts` (`executeFor` skills prepend),
`packages/pi-profiles/src/modules/pi-profiles/pi-profiles.module.ts` (`Profile` — `model`,
`skills`, no `thinking`) and `profile-store.services.module.ts` (`read`),
`packages/pi-specs/src/modules/{review-link,scaffold,structure,task}/*`,
`packages/pi-specs/src/apps/cli/cli.apps.module.ts` (`parseScaffoldTask`, `scaffold`,
`createCommand`, `parseSlashArgs`), `apps/workspace/src/services/specs/specs.services.module.ts`
(`readReviewSeries`, `inspect`, `buildResumeContext`, `executeSpec`), and the two review
skills (`.agents/skills/montflow-adversarial-review/SKILL.md` — always a new round;
`.agents/skills/montflow-addressing-adversarial-review/SKILL.md` — edits the latest round).
No file outside `.agents/@montflow/specs/` was touched; no tests were run (planning task,
no gates).

## Progress

- 2026-10-13: complete.

## Findings

### 1. Dispatch — one session per expected series/profile

**1a. How the profile reaches dispatch (decided).** Add `profile?: string` to
`ReviewDispatchInput` (`review-dispatch.apps.module.ts:17-32`) and a `profile` parameter to
the `review_create` tool (`extension.ts:40-58`). Dispatch resolves it against the profiles
store with `ProfileStore.read(root, profile)` — `@montflow/pi-reviews` already depends on
`@montflow/pi-profiles` (`packages/pi-reviews/package.json:43`), so no new dependency is
needed and `startReview`'s effect requirement gains `ProfileStore.ProfileStore`
(`ReviewStore.ReviewStore | ProfileStore.ProfileStore`). `extension.ts`'s `Live` layer
(`:12`) and the CLI layer (`binary.apps.module.ts:185`, `slash.apps.module.ts:243`) add
`ProfileStore.Default` (Node platform layers already supply `FileSystem`/`Path`).

**Resolution runs BEFORE `ensureSeries` (decided — F15).** `startReview` currently calls
`ensureSeries(input)` first (`review-dispatch.apps.module.ts:75,101`), and §2 makes
`ensureSeries` create/stamp a ledger when `input.profile` is set. Resolving the profile
inside or after `ensureSeries` would let a typo (`effect-reviewrr`) create a bogus,
stamped series before dispatch fails. Decided order in `startReview`:
1. when `input.profile` is set, `ProfileStore.read(input.root, input.profile)` — on
   failure return the error below and start no session, **before** `ensureSeries`;
2. `ensureSeries(input)` (which may then assume the profile resolves);
3. the session host and `sessionRunner.start`.
So an unknown profile leaves nothing on disk.

**Series name must agree with the profile (decided — F13).** The write path cannot stamp
`Profile: generic-reviewer` on the `spec-effect-reviewer` series, so the check is **not**
gated on the optional `spec`. When `input.profile` is set, `startReview` derives the
expected series name from the inputs it has and requires `input.name` to equal it;
otherwise it returns a displayable string and starts no session, also before
`ensureSeries`:
- `input.spec` set → the expected name is `<spec>-<input.profile>` (the literal
  `profileSeriesName` composition, B001 §2). Mismatch error:
  `Cannot dispatch review series '<name>': profile '<profile>' belongs to series '<spec>-<profile>'.`
- `input.spec` absent → the profile is encoded only as the name's `-<profile>` suffix, so
  `input.name` must end with `-<input.profile>`; the derived spec is the prefix before that
  suffix and the derived name is `input.name` itself. A name without that suffix is
  rejected: `Cannot dispatch review series '<name>': profile '<profile>' is not the series-name suffix.`
A name that does not encode the profile is rejected in both branches; a name that does is
accepted even when `spec` is omitted (a standalone profiled review). The F13 trigger —
`review_create({ name: 'spec-effect-reviewer', profile: 'generic-reviewer' })` with no
`spec` — is rejected: `spec-effect-reviewer` does not end with `-generic-reviewer`.

**Unknown profile fails earliest and loudest (decided).** When `input.profile` is set and
`ProfileStore.read` fails, `startReview` returns a displayable string and starts **no
session** — never a silent single-reviewer fallback (SPEC: "an unknown profile is a
verifiable failure, not a silent single-reviewer fallback"). Decided error text:
`Cannot dispatch review series '<name>': profile '<profile>' was not found under .agents/@montflow/profiles.`
(B001 §4.4; `ProfileStore.read` already fails `Profile not found: '<name>'.` at
`profile-store.services.module.ts:95`.)

**1b. Model application (decided).** The profile's `model` pins the session:
`const model = record.model.trim() === '' ? input.model : record.model;` passed as
`sessionRunner.start({ model })`. `ReviewDispatchInput.model` stays the fallback used by
the general reviewer and by a profile with a blank `model:` (the `effect-reviewer`
profile is blank today — A002). An explicit tool `model` param is therefore a fallback,
not an override of a profile pin; overriding means editing the profile. `Profile` is
**not** given a `model`-precedence change beyond this; the precedence is
`profile.model (non-empty) > input.model`.

**1c. Thinking source (decided).** `Profile` has **no** `thinking` field
(`pi-profiles.module.ts:13-26`, verified) and B002 does **not** add one — the SPEC's work
spans `pi-specs`, `pi-reviews`, and docs, not the `pi-profiles` schema. Source of thinking,
in precedence order:
1. the **resolved model's own `thinkingLevel`** — `pi-session.services.module.ts` applies
   `resolved?.thinkingLevel ?? request.thinking`, so a profile whose pinned model carries a
   thinking level gets it;
2. the explicit **`thinking`** carried on the dispatch input (the `review_create` tool gains
   a `thinking` param; `ReviewDispatchInput.thinking` is currently a dead field — A002),
   passed through `sessionRunner.start({ thinking })`;
3. Pi's default when neither applies.

So "the profile's thinking" is realised through its pinned model's thinking level, and the
explicit pin remains the override/default. A per-profile *thinking* pin would need a new
`Profile.thinking` field; that is explicitly **not** added here (recorded as a B003 open
question, not a defect).

**1d. Skills loading (decided — prompt-prepend, no new session input).** The profile's
`skills` are prepended to the reviewer prompt, exactly the `pi-prompts` `executeFor`
pattern (`extension.ts:181-183`): each name becomes
`Load the '<name>' skill before starting.`, joined by newlines and composed into the
single `prompt` string passed to `SessionRunner.start`. Rejected: adding `skills` to
`SessionRunnerStartInput` / the persisted `Session` schema
(`session-runner.services.module.ts:105-122` — no `skills` field; `session.module.ts` stores
no skills). Rationale: no new persisted-schema surface, no `pi-sessions` migration, and the
existing, proven precedent fits; `pi-sessions` stays untouched.

**1e. Exact round and phase targeted per series (decided — caller supplies both).**
`@montflow/pi-reviews` gains `@montflow/pi-specs` only for the F9 declared-profile
resolution pass (§2); `startReview` still does **not** compute the round — the orchestrator
owns cross-series round selection and supplies `input.round`/`input.phase`, so dispatch
never imports `roundForPhase`/`seriesNames`. Add `round?: string` and
`phase?: string` to `ReviewDispatchInput` and to the `review_create` tool. The
orchestrator (the executing-spec session, which already renders the convention via
`buildResumeContext`) computes the phase's target round **once** and passes the same
number to every series: the smallest three-digit round `>= roundForPhase(phase)` that is
free in **every** expected series (B001 §3). Dispatch never computes "the next free
round" for a phase review; it names `input.round` and `input.phase` in `reviewerPrompt`
(`- Round: <round>`, `- Phase: <phase>`) and in the ledger/round context; the reviewer
writes that exact round and records `- Phase: <phase>` (B002 §3). Both params are
optional so a standalone (non-phase) review keeps its current next-free behaviour
(back-compat) and omits `phase`. `reviewerPrompt` gains `- Profile: <p>` when set.

**1f. Per-profile ordering (decided — the orchestrator owns the loop).** `startReview`
stays a single-series, single-session primitive and keeps its `{ sessionId, series }`
result. The orchestrator spawns **one session per expected series** (B001 §2
`seriesNames(specName, profiles)`), in a deterministic order: the default (unprofiled)
series first, then each declared profile in declared task order (order is significant —
B001 §1). Wiring is one `review_create` call per series; a batch `startReviews` dispatch
API is rejected as unnecessary surface (A003 §4 already frames this as an
`executing-spec` rewrite, C004). Each session id stays unique because each series name is
unique (`Session.newId(`${input.name}-review`)`, `:109`).

### 2. Ledger `Profile:` stamping, `ensureSeries`, and `ProfileProbe`

**Order (decided — F15).** §1a resolves the profile and validates the series name
*before* `ensureSeries`; when either fails, `ensureSeries` never runs, so the
create/stamp/merge below only ever touches a series for a resolvable, correctly-named
profile.

**Stamping by creation (decided).** `SeriesScaffold` (`review.module.ts:1049-1056`) gains
`profile?: string | undefined`; `renderSeries` emits `- Profile: <name>` between `Rounds`
and `Created`, the position `authoringRules()` already documents
(`review.module.ts:1137-1142`). `SERIES_META_FIELDS` stays `['Target','Status','Rounds','Created']`
— `Profile` remains optional and `parseSeries` already validates a present value as a
slug (`:752-762`); no change there. `ensureSeries` passes `profile` into its `renderSeries`
call (`:78-84`) when `input.profile` is set.

**F4 — `ensureSeries` early return fixed (decided).** Today `ensureSeries` returns as soon
as the ledger exists (`review-dispatch.apps.module.ts:75`), so a ledger pre-created by
`mf-reviews create` is never stamped and `verifySeries` → `ProfileProbe` is skipped (A003
§4). Decided behaviour:
1. Read the existing ledger; parse it with `Review.parseSeries`.
2. If `parsed.issues.length > 0` **fail loudly**:
   `Series '<name>' ledger is malformed; run \`mf-reviews verify <name>\` before dispatching a profiled review.`
   (never silently rewrite a broken ledger).
3. Let `existingProfile = parsed.metadata['Profile'] ?? ''`.
   - `existingProfile === input.profile` → return (idempotent; re-dispatch is safe).
   - `existingProfile === ''` → **merge/stamp**: re-render with
     `Review.renderSeries({ name, target: parsed.metadata['Target'] ?? input.target ?? name,
     status: parsed.metadata['Status'] ?? 'open', created: parsed.metadata['Created'] ?? today,
     rounds: parsed.rounds, findings: parsed.findings, profile: input.profile })` and
     `store.saveSeries`. `renderSeries` regenerates both tables losslessly from the parsed
     rows, so `Rounds` stays consistent.
   - `existingProfile !== input.profile` → **fail loudly**:
     `Series '<name>' is already bound to profile '<other>'; refusing to dispatch profile '<profile>'.`
     (one `Profile:` per ledger — `parseSeries` allows only a single value).
4. When `input.profile` is **not** set, leave the existing ledger's metadata untouched
   (do not clear or add a `Profile:`); a stray profile in the default series is a verify
   concern, not dispatch's.

**`ProfileProbe` per series (decided — no probe-code change).** `verifySeries`
(`engines.apps.module.ts:292-304`) already reads `ledger.metadata['Profile']` and calls
`probe.verify(profile, scope.cwd)`, mapping `failed` → issue
`[profile] Profile '<name>' failed verification: …` and `unavailable` → warning.
`verifyAll` (`:335-346`) already runs `verifySeries` once per series, so once dispatch
stamps each profile ledger, every expected series is probed. The only new work is the
stamping above plus the series set (review-link, §3); `ProfileProbe` and `verifySeries`
are unchanged.

**F9 — declared-profile existence resolved by `mf-reviews verify --all` (decided).**
`verify:montflow:reviews` is `mf-reviews verify --all` + `doctor` (`package.json:30`).
`verifyAll` (`engines.apps.module.ts:335-346`) gains a second pass — `verifySpecProfiles` —
that is the shipped enforcement of SPEC's "an unknown profile is a verifiable failure":

- **Discovery.** Derive the specs root from the store scope's `cwd`:
  `<cwd>/.agents/@montflow/specs` (mirrors `pi-specs`' `DEFAULT_ROOT`,
  `cli.apps.module.ts:25`; the `--dir` root is the workspace root, `:41-43`). Read it with
  `@montflow/pi-specs`' `SpecStore` (`services/spec-store`) — `hasRoot`/`names`/`snapshot` —
  and parse each `TASK.md` with `parseTaskFile` (`task.module.ts:137-145`), so the TASK.md
  grammar stays single-owned. If the root is absent the pass is a no-op (a repo with
  reviews but no specs is not broken). Collect the `reviewerProfiles` of every
  `type === 'review'` task (`mf-specs check` already rejects the field on other types,
  F16), `pending` or `complete`, deduplicated per task.
- **Resolution.** For every collected profile, `ProfileStore.read(scope.cwd, profile)`
  (`profile-store.services.module.ts:88-107`) — `pi-reviews` already depends on
  `@montflow/pi-profiles` (`package.json:43`), so this is in-process and deterministic.
  A read failure adds one entry:
  `path: '.agents/@montflow/specs/<spec>/<task-dir>/TASK.md'`,
  issue `field: 'reviewer-profiles'`,
  `message: "Declared reviewer profile '<profile>' was not found under .agents/@montflow/profiles."`
  `ProfileProbe` is deliberately **not** used here: its `unavailable` outcome (the
  `mf-profiles` bin is absent) must not mask a missing profile.
- **Dependency.** `@montflow/pi-reviews` gains `@montflow/pi-specs` (`package.json`) so the
  task grammar is not re-parsed in a second package; the workspace already consumes the
  same package (`apps/workspace/package.json:41`). Dispatch is unaffected — it still does
  not compute the round (§1e). Recorded against §5/§6.
- **Scope.** Every `review` task, `pending` or `complete`, and independent of any series.
  This closes F9's exact trigger — a valid slug that names no profile and has no series yet
  — which the completion-scoped link check missed (round-005 F9) and which the gitignored
  series store cannot gate repo-wide (F17).
- **Wiring.** `verifyAll` merges these entries into its report
  (`engines.apps.module.ts:341-345`); its effect requirement gains
  `SpecStore.SpecStore | ProfileStore.ProfileStore`; the CLI layers add
  `SpecStore.Default` + `ProfileStore.Default` (`binary.apps.module.ts:185`,
  `slash.apps.module.ts:243`, `extension.ts:12`).

### 3. Review-link verifier — expected series set, phase attribution, and issue text

**New module surface (decided), in `packages/pi-specs/src/modules/review-link/review-link.module.ts`:**

- `profileSeriesName(specName, profile) = `${specName}-${profile}`` and
  `seriesNames(specName, profiles) = [seriesName(specName), ...profiles.map(profileSeriesName)]`
  (B001 §2; confirmed, not re-decided).
- `seriesName` and `roundForPhase` unchanged (`:37`, `:45`); `TaskEntry` / `reviewPhases`
  unchanged (the workspace `buildResumeContext` still consumes `reviewPhases`).
- New `ReviewTaskEntry { readonly phase: string; readonly profiles: ReadonlyArray<string>;
  readonly complete: boolean }` (`complete` = the review task's `status === 'complete'`).
- **`SeriesSnapshot` carries per-round phase attribution** (widened from
  `{ name, rounds: ReadonlyArray<string> }`, `:23-29`):

  ```ts
  export interface SeriesRoundSnapshot { readonly round: string; readonly phase?: string | undefined }
  export interface SeriesSnapshot { readonly name: string; readonly rounds: ReadonlyArray<SeriesRoundSnapshot> }
  ```

  The workspace caller reads each round file's `Phase:` metadata through
  `@montflow/pi-reviews`' `Review.parseRound(round, raw).metadata['Phase']`
  (`review.module.ts:537`; `ParsedRound.metadata` `:155`) and builds the snapshot; a round
  with no `Phase:` has `phase: undefined`. The round grammar keeps a single owner — the
  workspace does **not** hand-roll a `Phase:` match (F20).
- New `verify` signature, replacing the single-snapshot form (`:69-102`):

  ```ts
  export const verify = (
    specName: string,
    reviewTasks: ReadonlyArray<ReviewTaskEntry>,
    series: ReadonlyArray<SeriesSnapshot>,
  ): Result
  ```

  `verifySpecTree` supplies one `ReviewTaskEntry` per `review` task via
  `{ phase: phaseOf(task.id), profiles: task.reviewerProfiles, complete: task.status === 'complete' }`.

**Attribution, not number (decided; see B001 §3).** The fix→re-review loop writes a new
round per pass (`SKILL.md:70,72`), so a phase can occupy several rounds and a fixed
`roundForPhase(phase)` presence check cannot tell Phase A's loop round `002` from Phase
B's review round `002`; an earlier loop round would silently satisfy a later phase (F10).
So `verify` binds by phase attribution. For each review task `(phase, profiles)`:

- **A phase whose review task is not `complete` requires no round**: the phase is not
  reviewed yet, and requiring one would force a fabricated placeholder (F11). This is what
  lets C005 close before C099 runs.
- **A `complete` phase review must have, in each `seriesName` in
  `seriesNames(specName, profiles)`, a round whose `Phase === phase`.** For each expected
  series that is absent →
  `field: 'review-series'`,
  `message: "Phase '<phase>' has a review task but review series '<series>' does not exist."`
  Series present but no round attributed to the phase →
  `field: 'review-series'`,
  `message: "Phase '<phase>' has a review task but series '<series>' has no round attributed to phase '<phase>'."`
- **The attributed round number must agree across the phase's expected series**, else:
  `"Phase '<phase>' is reviewed at round <r1> in '<series1>' but round <r2> in '<series2>'."`

One issue per offending `(phase, series)` pair. The old fixed `roundForPhase` presence
check and the old "series name is X but the convention names it Y" check (`:77-84`) are
**dropped**: with a caller-supplied set the verifier is driven by expected names, and a
supplied snapshot outside the expected set is ignored (the caller may hand over a
superset), not an issue.

**Consequences (decided).** A completed phase always carries a real, phase-attributed
round (written by its reviewer, never a placeholder), so the verifier can no longer pass a
phase whose review never ran. In this spec: default rounds `001`–`003` are `Phase: A`,
round `004` is `Phase: B`, and C's round is written by C099. The round-per-phase SPEC
requirement is restated (SPEC.md) as "a phase's review lands on the same round number in
every series, attributed to that phase; the phase rank is the preferred number".

**Where the collection comes from (decided — F9/F17, revised).** `mf-specs check`
(`verify:montflow:specs`) **stays series-free**: `check` calls `verifySpecTree(snapshot)`
with no `review` argument (unchanged at `cli.apps.module.ts:104,187`). The link check is
driven only by the **workspace caller** (F12: `inspect`/`summarize` supply the
`SeriesSnapshot[]` for the panel and the resume context, §6). This is required: review
series live under `.agents/@montflow/reviews`, which is **gitignored** (`.gitignore:255`),
so no repo-wide gate may require a series or a round to exist. `pi-specs` never reads a
round file's contents and never imports `@montflow/pi-reviews`; `SeriesSnapshot` is an
in-package data contract, and the workspace is its only collection-supplying caller.
The workspace reads round contents through `@montflow/pi-reviews` (a new `apps/workspace`
dependency, §6) and attaches `Phase:` via `Review.parseRound`, so the round `## Metadata`
grammar keeps one owner instead of a second hand-rolled parser (F20).

**Round grammar for `Phase:` (decided — round-grammar change, pulled forward).**
`packages/pi-reviews/src/modules/review/review.module.ts`: `RoundScaffold`
(`:996-1006`) gains `phase?: string | undefined`; `renderRound` (`:1016-1046`) emits
`- Phase: <phase>` after `Round` when set; `parseRound` (`:537`) already captures any
metadata key, and the `verifyRoundFile`/`parseRound` metadata checks (`:561-619`) add an
optional validation that a present `Phase` is a phase id (`/^[A-Z]{1,2}$/`). Standalone
rounds omit the line, so `ROUND_META_FIELDS` is unchanged.

**`Phase:` producer and consumer order (decided — F18).** With `mf-specs check`
series-free (§3), the only consumer of per-round `Phase:` attribution is the **workspace
verifier** (`inspect`/`summarize` → `verifySpecTree` with the collection, F12); the repo
gate no longer reads rounds. The round-grammar producer (`RoundScaffold.phase`,
`renderRound`, and the `verifyRoundFile` `Phase` validation) is owned by **C002** — the
same task as the attribution consumer — so the producer lands with, not after, its
consumer. C003 keeps `SeriesScaffold.profile`/`renderSeries` (ledger `Profile:`) and
dispatch; C004 writes the reviewer's `- Phase:` line and C005 stamps the existing rounds
(data migration, §2d item 6). This resolves F18's original trigger (C002 consuming a
grammar C003 had not yet produced).

### 4. Task-contract and scaffold verifier changes, and the tests per changed unit

**Task contract (decided; B001 §1 owns the field).** `packages/pi-specs/src/modules/task/task.module.ts`:

- `Task` gains `reviewerProfiles: Schema.Array(Schema.String.check(Schema.isPattern(SLUG_PATTERN)))`
  after `relatedTasks`, before `findingRef` (`:91-95`); `TaskInput` (`:106-115`) gains
  `readonly reviewerProfiles: ReadonlyArray<string>`; `taskInput` sets it via
  `fieldList(fields, 'reviewer-profiles')` (`:117-130`); export
  `REVIEWER_PROFILES_FIELD = 'reviewer-profiles'`.
- `verifyTaskFile` (`:200-274`) adds the **syntactic** fail point (B001 §4.1): every
  `reviewer-profiles` entry must match `SLUG_PATTERN`, duplicate entries are rejected, and
  the field is **rejected on a non-`review` task** (F16) —
  `[reviewer-profiles] only valid on a 'review' task.` It must not resolve real profiles
  (`pi-specs` depends only on `@effect/platform-node` — `packages/pi-specs/package.json:41-43`).
  **Duplicates are enforced by the verifier only:** `Task`/`parseTaskFile` accept a
  duplicated list (`task.module.ts:81-98,117-130`), so any direct parser (`buildResumeContext`,
  dispatch) must treat the list as declared; `mf-specs check` is the gate that rejects
  duplicates (F16).
- `FINDING_REF_PATTERN` (`:21`) becomes `/^[a-z0-9]+(?:-[a-z0-9]+)*\/\d{3}\/F\d+$/` and the
  `:256-259` message becomes `Must be a finding reference like '<series>/<round>/F1'.`
  (B001 §5; confirmed, implemented by C001).

**Tests (decided).** `packages/pi-specs/src/modules/task/tests/`: `parse-task-file.test.ts`
(absent / empty / comma-separated / `- item` list normalize to `[]` or the list); extend
`helpers.ts` `TaskFixture` with `reviewerProfiles?: string`. `verify-task-file.test.ts`:
valid list passes; malformed entry issue; duplicate issue; `reviewer-profiles` on an
`execution` task rejected (F16); `finding-ref` fixtures updated to the qualified locator
(`'F2'` → `'s/002/F2'`, `'nope'`/`'F'` stay invalid).

**Review-link tests (decided).** `review-link.test.ts`: `profileSeriesName` / `seriesNames`
composition; `verify` passes when a `complete` phase has a `Phase`-attributed round in every
expected series; a `pending` review phase requires no round; missing default series; missing
profile series only; a `complete` phase with no `Phase`-attributed round in one of two
series; two series attributing the phase to different round numbers (mismatch issue); a
round with no `Phase` does not satisfy a `complete` phase.

**Structure tests (decided).** `verify-spec-tree.test.ts` (+ `helpers.ts`): the `review`
argument is now `ReadonlyArray<SeriesSnapshot>`; add a tree whose (complete) review task
carries `reviewer-profiles: effect-reviewer` and a collection containing both
`ship-spec` and `ship-spec-effect-reviewer` with a `Phase`-attributed round (passes), then
drop the profile series (one `review-series` issue per missing `(phase, series)`).

**Scaffold tests (decided).** `packages/pi-specs/src/modules/scaffold/scaffold.module.ts`:
`ScaffoldTask` (`:24-37`) and `ScaffoldSpecInput` (`:40-53`) gain
`reviewerProfiles?: ReadonlyArray<string>`; `renderReview(phase, id, profiles)` (`:168`)
emits `reviewer-profiles:` (empty by default, comma-separated when set) and
`renderSpecScaffold` (`:246-270`) threads it. Tests in `scaffold.test.ts`: an empty
`reviewer-profiles:` line by default; `reviewer-profiles: effect-reviewer` when supplied;
the emitted tree still `verifySpecTree`-clean.

**F3 — the `pi-specs` CLI scaffold path (decided).**
`packages/pi-specs/src/apps/cli/cli.apps.module.ts` is the production producer of
`ScaffoldTask`, omitted from A003 §4's earlier list. Changes:
- `ScaffoldOptions` (`:600-611`) gains `reviewerProfiles?: ReadonlyArray<string>`;
  `scaffold` (`:664-714`) validates each against `SLUG_PATTERN` (duplicates rejected) and
  passes them to `renderSpecScaffold` (`:698-705`).
- `createCommand` (`:803-843`) gains a `reviewer-profiles` flag (comma-separated,
  reuse `csv` at `:741-747`); the slash form adds `reviewer-profiles` to `SLASH_VALUE_FLAGS`
  (`:961-969`), `parseSlashArgs` (`:1003-1034`), and the `create` path (`:1063-1080`).
- Rejected: extending the per-task `name[:type[:gates]]` grammar (`parseScaffoldTask`,
  `:635-653`) to carry profiles. Only the single auto-appended review task needs the list;
  a phase-level `--reviewer-profiles` flag is clearer and leaves `parseScaffoldTask` alone.
- Tests in `create.test.ts`: `--reviewer-profiles effect-reviewer` is emitted on the review
  task; the empty default; an invalid slug and a duplicate are refused; `runSlash create`
  threads the flag and the tree still `check`s clean (extend the existing `runSlash` case at
  `:99-115`).

**F9 — `mf-reviews verify --all` resolves declared profiles (decided).**
`packages/pi-reviews/src/apps/cli/engines.apps.module.ts`: new `verifySpecProfiles(scope)`
(§2) plus `verifyAll` merging its entries. Tests in
`packages/pi-reviews/src/apps/cli/tests/` (extend `engines.test.ts` or a new
`verify-spec-profiles.test.ts`): a `TASK.md` whose `type: review` task declares
`reviewer-profiles: effect-reviewer` with `effect-reviewer/PROFILE.md` present passes;
with no `PROFILE.md` it fails with the exact §2 message; a `pending` review task still
fails (the round-005 F9 residual); a non-`review` task's field is ignored; an absent specs
root is a no-op; `verify --all` reports the spec-profile issue in its `issueCount`
(non-zero exit).

**`mf-specs check` stays link-free (decided — F17).**
`packages/pi-specs/src/apps/cli/cli.apps.module.ts` `CheckOptions`/`check` (`:57-116`) are
**unchanged**: `check` calls `verifySpecTree(snapshot)` with no `review`. Tests in
`src/apps/cli/tests/check.test.ts`: add a no-profile spec with a `complete` review task and
**no** series on disk that verifies clean (the back-compat regression F17 names), proving
the repo gate is series-free.

**F12 — workspace series-collection discovery (decided).**
`apps/workspace/src/services/specs/specs.services.module.ts`: `readReviewSeries(root,
name)` (`:86-93`) reads exactly one directory named after the spec. Widen it to take the
spec's expected series names and return a `ReviewSeries[]`: parse the spec's tasks
(`parseTaskFile`), collect each `review` task's `reviewerProfiles`, and call
`libs.ReviewLink.seriesNames(specName, profiles)` — **not** a `name-*` prefix scan (which
would pull in another spec's series, F14). Read each expected series via the existing
round listing and attach each round's `Phase:` through `@montflow/pi-reviews`'
`Review.parseRound(round, raw).metadata['Phase']` — add `@montflow/pi-reviews` to
`apps/workspace/package.json` rather than re-implementing the `## Metadata` rule (F20) —
producing `{ name, rounds: { round, phase }[] }`. `inspect` (`:221-224`) and `summarize` pass the
whole collection to `verifySpecTree`; `executeSpec` (`:705`) and `buildResumeContext`
(`:618-627`) consume it: thread `reviewerProfiles` into the task projection
(`tasks.map((task) => ({ id: task.id, type: task.type, reviewerProfiles: task.reviewerProfiles }))`)
and render one line per expected series per review phase, each `(missing)` independently.
If the profile list cannot be parsed, fall back to the default series only.

**pi-reviews render/dispatch tests (decided).**
`packages/pi-reviews/src/modules/review/tests/verify-series.test.ts`: `renderSeries({ …,
profile: 'effect-reviewer' })` contains `- Profile: effect-reviewer` between `Rounds` and
`Created` and round-trips through `parseSeries`; a blank `profile` omits the line (C003).
`renderRound({ …, phase: 'C' })` contains `- Phase: C` and round-trips through
`parseRound`; a blank/absent `phase` omits the line; a malformed `Phase` value is an issue
(**C002** — the round-grammar producer, F18).
`packages/pi-reviews/src/apps/dispatch/tests/review-dispatch.test.ts`: `ensureSeries`
creates a stamped ledger for a profile; stamps a pre-created unstamped ledger (the F4
regression); is idempotent on re-dispatch; fails loudly on a different existing profile and
on a malformed ledger; fails on an unknown profile (`ProfileStore` stub returning
`Profile not found`) **without** the session host being reached and **without creating a
series** (F15 ordering); rejects a profiled `name` that does not encode `profile` — both
with `spec` (`name !== `${spec}-${profile}``) and without `spec` (`name` lacks the
`-${profile}` suffix) (F13); `reviewerPrompt` names the round, the phase, the profile, and
the prepended skill lines. Extend the existing prompt test at `:17-28`.

**Extension test (decided — new file).** No `packages/pi-reviews/src/extension*.test.ts`
exists today. Add `packages/pi-reviews/src/extension.test.ts` with a fake `ExtensionAPI`
capturing the registered `review_create` tool: assert `parameters` include `profile`,
`round`, `phase`, and `thinking`, and that `execute` forwards them into
`Dispatch.ReviewDispatchInput` (and decodes `thinking` against the `Session.ThinkingLevel`
values, failing on an unknown level).

**CLI flag tests (decided).** `packages/pi-reviews/src/apps/cli/tests/engines.test.ts`:
`Engines.scaffold({ profile: 'effect-reviewer' })` writes `- Profile:`; the `declareProfile`
helper comment ("the field has no CLI flag", `:42`) is updated. Add a focused
`packages/pi-reviews/src/apps/cli/tests/slash.test.ts` (new; none exists) asserting
`parseCliArgs('create demo --profile effect-reviewer')` yields `profile: 'effect-reviewer'`
and an unknown flag still yields `Help`; the binary uses `createFlags` so the engine test
covers the `--profile` wiring.

**Workspace tests (decided — F12).** `apps/workspace/src/services/specs/tests/execute-flow.test.ts`
`:127` asserts a single `ship-login/001 (missing)` line and `:139-142` asserts one
`phase A` issue; both become per-series assertions, plus a new case where the review task
declares `reviewer-profiles: effect-reviewer` and the profile series is missing its round
(two series lines, two `review-series` issues). The workspace derives the series names
from the parsed review tasks (not a `name-*` prefix scan) and threads `reviewerProfiles`
into the `buildResumeContext` task projection (see §6).

### 5. Deliberate NON-changes

| Non-change | Why |
| ---------- | --- |
| **Per-reviewer tool sets** | Every reviewer session keeps `REVIEW_TOOLS = ['read','write','edit','bash']` (`review-dispatch.apps.module.ts:59`); the profile never selects tools. SPEC does not ask for it, and it would widen the profile contract. |
| **Per-reviewer prompts beyond the profile** | The prompt stays the `montflow-adversarial-review` pass plus series/round/profile context and the prepended skill lines. `Profile.instructions` and `Profile.checklist` remain unread (A002) — injecting them is a larger prompt-authoring change, out of B002. |
| **`### F<n>` finding grammar** | `parseFindings`/`renderFindingsTable` and the ledger tables are unchanged; only round *metadata* gains the optional `Phase:` (§3). |
| **`SERIES_META_FIELDS` / `parseSeries` / `verifySeriesFile`** | `Profile` stays optional; the existing single-slug validation is enough. |
| **`ProfileProbe` and `verifySeries`** | Unchanged; they already probe a ledger's `Profile`. |
| **`SessionRunnerStartInput` / `Session` schema** | No `skills` field added (§1d). |
| **`Profile` schema** | No `thinking` field added (§1c). |
| **`pi-specs` reading the reviews store** | `mf-specs check` stays series-free (§3, F17): `verifySpecTree` is called with no `review`, `pi-specs` never reads a round file's contents, and it never imports `@montflow/pi-reviews`. The collection is supplied only by the workspace caller (F12). |
| **`apps/workspace` hand-parsing the round grammar** | Not done: the workspace depends on `@montflow/pi-reviews` and attaches `Phase:` via `Review.parseRound` (§3/§6), so the `## Metadata` round grammar stays single-owned and `pi-specs` still owns no round grammar (F19/F20). |
| **`pi-reviews` computing the round** | `@montflow/pi-reviews` gains `@montflow/pi-specs` for the F9 resolution pass (§2), but `startReview` still does not import `roundForPhase`/`seriesNames`; the orchestrator owns round selection (§1e). |
| **`verifySeries` cross-store name agreement** | Unchanged: `verifySeries` probes whatever `Profile:` the ledger declares. The name↔`Profile:` agreement is enforced on the **write path** (dispatch, §1a, F13), not re-derived in `verifySeries`. |
| **Ledger `Status`/lifecycle, `ReviewStore` I/O** | Untouched. |

### 6. Interface changes and the files that hold them

| Interface / symbol | File | Change | Task |
| ------------------ | ---- | ------ | ---- |
| `Task.reviewerProfiles`, `TaskInput.reviewerProfiles`, `taskInput`, `REVIEWER_PROFILES_FIELD` | `packages/pi-specs/src/modules/task/task.module.ts` | New optional list field from `fieldList(fields,'reviewer-profiles')` | C001 |
| `verifyTaskFile` | `packages/pi-specs/src/modules/task/task.module.ts` | Slug-check each profile, reject duplicates, reject on a non-`review` task (F16) | C001 |
| `FINDING_REF_PATTERN`, `finding-ref` issue text | `packages/pi-specs/src/modules/task/task.module.ts` | Qualified locator `<series>/<round>/F<n>` (B001 §5) | C001 |
| `SeriesRoundSnapshot`, `SeriesSnapshot`, `ReviewTaskEntry` (`complete`), `profileSeriesName`, `seriesNames`, `verify` | `packages/pi-specs/src/modules/review-link/review-link.module.ts` | Per-round `Phase` attribution; expected-series set; per-`(phase,series)` attribution issues | C002 |
| `verifySpecTree(snapshot, review?)`, `ReviewTaskEntry[]` build | `packages/pi-specs/src/modules/structure/structure.module.ts` | `review` widens to `ReadonlyArray<SeriesSnapshot>`; passes each review task's `reviewerProfiles` + `complete`; supplied only by the workspace caller (F17) | C002 |
| `verifySpecProfiles`, `verifyAll` | `packages/pi-reviews/src/apps/cli/engines.apps.module.ts` | New pass resolving every spec's declared `reviewer-profiles` against the profiles store (F9) | C003 |
| `SpecStore.Default` + `ProfileStore.Default` in the CLI layers | `packages/pi-reviews/src/apps/cli/{binary,slash}.apps.module.ts`, `packages/pi-reviews/src/extension.ts` | Provide the services `verifyAll` now needs (F9) | C003 |
| `@montflow/pi-specs` dependency | `packages/pi-reviews/package.json` | Reuse `SpecStore`/`parseTaskFile` for the F9 pass (single TASK.md grammar owner) | C003 |
| `ScaffoldTask.reviewerProfiles`, `ScaffoldSpecInput.reviewerProfiles`, `renderReview(phase,id,profiles)` | `packages/pi-specs/src/modules/scaffold/scaffold.module.ts` | Emit `reviewer-profiles:` on the review task | C001 |
| `ScaffoldOptions.reviewerProfiles`, `createCommand` flag, `parseSlashArgs`/`SLASH_VALUE_FLAGS` | `packages/pi-specs/src/apps/cli/cli.apps.module.ts` | `--reviewer-profiles` (F3) | C001 |
| `SeriesScaffold.profile`, `renderSeries`, `authoringRules` | `packages/pi-reviews/src/modules/review/review.module.ts` | Emit `- Profile:` after `Rounds` | C003 |
| `RoundScaffold.phase`, `renderRound`, `parseRound`/`verifyRoundFile` `Phase` validation | `packages/pi-reviews/src/modules/review/review.module.ts` | Optional `- Phase: <phase>` round metadata; owned by C002 with its attribution consumer (F18, §3) | C002 |
| `ReviewDispatchInput.profile`/`round`/`phase`, `ensureSeries`, `reviewerPrompt`, `startReview` | `packages/pi-reviews/src/apps/dispatch/review-dispatch.apps.module.ts` | Resolve profile + validate name **before** `ensureSeries` (F13/F15); stamp/merge ledger; prepend skills; name exact round + phase | C003 |
| `review_create` `profile`/`round`/`phase`/`thinking` params; `Live` layer | `packages/pi-reviews/src/extension.ts` | New tool params; add `ProfileStore.Default` | C003 |
| `ScaffoldFields.profile` | `packages/pi-reviews/src/apps/cli/engines.apps.module.ts` | Pass `profile` into `renderSeries` | C003 |
| `createFlags.profile` | `packages/pi-reviews/src/apps/cli/binary.apps.module.ts` | `--profile` flag | C003 |
| `CliAction.Create.profile`, `parseCliArgs` known set, `run` Create case | `packages/pi-reviews/src/apps/cli/slash.apps.module.ts` | `--profile` | C003 |
| `USAGE`, `COMMAND_DESCRIPTION` | `packages/pi-reviews/src/apps/cli/renderers.apps.module.ts` | Align the already-advertised `--profile` | C003 |
| `readReviewSeries`→series collection, `inspect`, `buildResumeContext`, `executeSpec` | `apps/workspace/src/services/specs/specs.services.module.ts` | Derive series names from parsed review tasks (+`reviewerProfiles` projection); read/return the collection; attach each round's `Phase:` via `Review.parseRound`; one context line per series (F12/F20) | C002 |
| `@montflow/pi-reviews` dependency | `apps/workspace/package.json` | Add `workspace:*` so `readReviewSeries` reads `Phase:` through `Review.parseRound` — single round-grammar owner, no hand-rolled `## Metadata` match (F20) | C002 |
| `EXECUTING_SPEC` review step | `packages/pi-specs/src/skills/executing-spec.ts` | One reviewer per series; compute and pass the same exact round + phase + profile | C004 |
| `montflow-adversarial-review` round wording | `.agents/skills/montflow-adversarial-review/SKILL.md` | Explicit round is authoritative; populate an empty scaffold; record `Phase:` | C004 |

## Open Questions

- **B003:** the `effect-reviewer` model pin (blank today — A002) — inherit the dispatcher's
  model or pin one; and the documented migration note for existing specs/series.
- **B003:** whether to backfill `reviewer-profiles` onto existing specs and this spec's
  `C099`, the docs/changelog/changeset rollout (pi-specs private but not ignored;
  pi-reviews ignored), and stamping `Phase:` onto the existing `montflow-multi-reviewer`
  rounds `001`–`004` during migration.

## Handoff

- Feeds B003 plan-rollout-and-migration.

## Deviations

- None.
