# Memory

## Context

Task A003: consolidate A001 (review pipeline) and A002 (profile binding) into one
buildable multi-reviewer contract — the chosen mechanism, the review-task profile
declaration, the derived series naming, the per-package change list, a risk table,
and the `effect-reviewer` binding input. Naming/validation facts were re-verified in
`packages/pi-specs/src/modules/{spec/spec.module.ts,task/task.module.ts,
structure/structure.module.ts,scaffold/scaffold.module.ts,
frontmatter/frontmatter.module.ts}`, `packages/pi-specs/src/skills/executing-spec.ts`,
and `packages/pi-reviews/src/{modules/review/review.module.ts,
apps/dispatch/review-dispatch.apps.module.ts,extension.ts,apps/cli/*}`. No file outside
`.agents/@montflow/specs/` was touched.

## Progress

- 2026-10-13: complete.

## Findings

### 1. Chosen mechanism — one series per reviewer profile

A review task may declare **additional** reviewer profiles; each declared profile
runs the existing `montflow-adversarial-review` skill against its **own series**, and
the phase rank still maps to the same round number in every series. The always-present
general (unprofiled) reviewer keeps the default series, so today's behavior is the
empty-list case.

Why this beats merging reviewers into one round. A001 documents two collision mechanics
for one shared series (`A001-explore-review-pipeline/MEMORY.md`, "Notes on the two
collision mechanics"); A003 adds a third reason of its own:

- **Round-file contention (A001 collision 1).** Every artifact path is
  `<series>/<round>/REVIEW.md` and nothing else keys a round
  (`ReviewStore.saveRound`/`readRound` in
  `packages/pi-reviews/src/services/review-store/review-store.services.module.ts`;
  `roundPath` in `packages/pi-reviews/src/apps/cli/engines.apps.module.ts`). Two
  reviewers on one phase sharing a series write the same file and overwrite each other.
  Distinct series names are what give each reviewer its own file.
- **Finding-id collision (A001 collision 2).** One shared series also shares the `F<n>`
  id space. Series-per-profile does **not** resolve this collision — it widens it — so the
  id space is handled separately below, not claimed as a win here.
- **Isolation / one `Profile` per ledger (A003's own reason, not one of A001's two).**
  Each reviewer owns exactly one series and one ledger; `verifySeries`
  (`apps/cli/engines.apps.module.ts`) verifies one `Profile:` per series
  (`SERIES_META_FIELDS` is `['Target','Status','Rounds','Created']`; `Profile` is an
  optional extra). One series per profile keeps each ledger's `Profile:` a single,
  meaningful value instead of an unordered list.

The default series name stays the spec name (`seriesName = specName`, review-link
line 37); unique per-profile series names give each reviewer its own round file. No
duplicate `review` task per phase is needed — one review task carries the whole list, so
A001's "duplicate review tasks collapse in `reviewPhases`" is avoided rather than relied
on.

**Series-per-profile does _not_ resolve the `F<n>` / `finding-ref` id space.** An earlier
draft claimed distinct series names "disjoint the `F<n>` space"; that is unsound. A `defect`
task cites a finding with a bare `F<n>` (`FINDING_REF_PATTERN = /^F\d+$/` at
`packages/pi-specs/src/modules/task/task.module.ts:21`; `findingRef` at `:95`, validated at
`:256-259`) with no series or round qualifier. `parseFindings`'s `seenIds` only enforces
uniqueness within one round file (`packages/pi-reviews/src/modules/review/review.module.ts:365,383-393`),
and the series index is keyed `Round | ID` (`:953-963,987-994`), so `F1` already repeats
across rounds of one series today. Per-profile series put `F1` in **every** series of one
spec at the same round, so a `finding-ref: F1` is ambiguous across series — the opposite of
disjoint. This is the same ambiguity §5 rates High/HIGH ("`F<n>` / `finding-ref` ambiguity
across series"), and A001 raises the fix shape as an open question without deciding it.

**B001's explicit obligation:** resolve the cross-series id space rather than carrying the
"disjoint" claim forward. Concretely, either (a) qualify `finding-ref` per series (e.g.
`<series>#F<n>`) with a matching `FINDING_REF_PATTERN` change plus a migration for existing
`finding-ref` values, or (b) mandate distinct id ranges per series (a convention, no pattern
change, but weaker enforcement). The chosen option must be stated so B002's verifier and the
`defect` authoring flow can enforce it.

### 2. Review-task profile declaration

- **Field name (proposal):** `reviewer-profiles`. Optional on disk; absent/empty
  normalizes to `[]`. Marked a proposal because no such field exists in source today.
- **Position:** after `related-tasks` and before `status`, mirroring where
  `findingRef` sits in the `Task` schema (`task.module.ts`). On-disk frontmatter order:
  `id, name, type, originator, depends-on, related-tasks, reviewer-profiles, status`.
- **Wire format:** the `fieldList` grammar in
  `packages/pi-specs/src/modules/frontmatter/frontmatter.module.ts` accepts either a
  comma-separated scalar (what the skills and scaffold already use for
  `depends-on`/`related-tasks`) or a YAML `- item` list. Canonical is the
  comma-separated scalar. Scaffold emits `reviewer-profiles:` (empty) by default, or
  `reviewer-profiles: effect-reviewer, generic-reviewer` when set.
- **Default:** empty list = today's single general reviewer only. The declared entries
  are **additional** reviewers (join, not replace): the general unprofiled reviewer
  always runs, always against the default spec-name series. This matches SPEC
  "each additional profile gets a slug-safe series name" and "exploration and planning
  phases keep a general reviewer only".
- **Semantics:** each entry must be a profile slug validated against the profiles store
  (SPEC: unknown profile is a verifiable failure, never a silent fallback). **Forced
  constraint:** `verifyTaskFile` can only check `SLUG_PATTERN` — `packages/pi-specs`
  depends only on `@effect/platform-node` and has no profiles dependency
  (`task.module.ts:200-274`). The only component that can verify a *real* profile is
  pi-reviews' `ProfileProbe`, which runs off a series ledger's `Profile:` and therefore
  fires only once that series exists (`engines.apps.module.ts:292-304`). A spec that
  declares an unknown profile but whose series has not yet been created verifies cleanly
  today. B002 must resolve this by one of two concrete options: **(a)** stamp/verify
  `Profile:` at series creation (see the dispatch change below) so an unknown profile is a
  series-verify failure, or **(b)** add a spec↔profiles integration check in the
  workspace/pi-reviews integration that resolves each declared slug against the profiles
  store at spec-verify time. Marking it "verify vs dispatch" is not a free choice:
  `verifyTaskFile` cannot resolve a profile.
- **`SPEC.md` task table:** unchanged. Columns stay `ID | Name | Type | Status | Gates`
  (`parseTaskTable` / `TASK_TABLE_ROW` in `spec.module.ts`); the declaration lives only
  in `TASK.md`.

Example declaration on this spec's Phase C review task:

```markdown
---
id: C099
name: review-phase
type: review
originator: user
depends-on:
related-tasks:
reviewer-profiles: effect-reviewer
status: pending
---
```

### 3. Derived series naming (spec name + profile)

Verified validators: `SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/`, `isValidName`, and
`slugify` (collapse any run of non-alphanumerics to one hyphen, trim) exist identically
in `packages/pi-specs/src/modules/spec/spec.module.ts` and
`packages/pi-reviews/src/modules/review/review.module.ts`. Spec names are already
validated against `SLUG_PATTERN`, as are profile names (`isValidName` in `parseSeries`,
`Profile.name` matching its directory).

- **Default series:** `seriesName(specName)` = `specName` — identity, unchanged
  (back-compat; SPEC requirement).
- **Profile series (proposal):** `profileSeriesName(specName, profile)` =
  `slugify(`${specName}-${profile}`)`. With both inputs already valid slugs this is the
  literal join; `slugify` only guarantees slug-safety for defensive callers.
- **Expected series set (proposal):** `seriesNames(specName, profiles)` =
  `[specName, ...profiles.map((p) => profileSeriesName(specName, p))]`.
- **Round:** `roundForPhase(phase) = String(phaseRank(phase)).padStart(3,'0')` is
  unchanged and identical in every series (phase `A` → `001`, `C` → `003`).

Collision-freeness: within one spec the default name and every profile series differ
(the profile series always appends `-<profile>`), and distinct profiles yield distinct
names. Residual ambiguity: because a hyphen is the only separator and it also occurs
inside both components, two *different* specs could compose the same name (spec `a-b` +
profile `c` vs spec `a` + profile `b-c`). This is cross-spec only and unresolved here —
B001 decides whether to accept it or add a disambiguating marker (a marker using only
`[a-z0-9-]` cannot be fully injective; e.g. `--` is rejected by `SLUG_PATTERN`).

### 4. Concrete change list per package

**`pi-specs`** (`packages/pi-specs/`)

- `src/modules/task/task.module.ts`
  - `Task` Schema.Class: add `reviewerProfiles` (proposal), mirroring
    `dependsOn`/`relatedTasks` as a required `Schema.Array` that defaults to `[]`.
  - `TaskInput`: add `readonly reviewerProfiles: ReadonlyArray<string>`; `taskInput`
    sets it from `fieldList(fields, 'reviewer-profiles')`.
  - `verifyTaskFile`: validate every entry against `SLUG_PATTERN` (not required, so
    existing checks are not weakened).
  - New exported constant `REVIEWER_PROFILES_FIELD = 'reviewer-profiles'` (proposal)
    and/or a `reviewerProfilesOf(task)` helper (proposal) for review-link.
  - Tests: `src/modules/task/tests/parse-task-file.test.ts`,
    `verify-task-file.test.ts`.
- `src/modules/review-link/review-link.module.ts`
  - Keep `seriesName` (default identity) and `roundForPhase`.
  - New `profileSeriesName` / `seriesNames` (proposals, see §3).
  - `verify(...)`: accept the set of expected series — e.g.
    `verify(specName, reviewTasks: ReadonlyArray<{ phase; profiles }>, series: ReadonlyArray<SeriesSnapshot>)`
    (proposal) — and report a missing round **per series and phase**; never force a
    single series when profiles are declared.
  - Keep `reviewPhases` for the default-series check; add per-phase profile extraction.
  - Tests: `src/modules/review-link/tests/review-link.test.ts`.
- `src/modules/structure/structure.module.ts`
  - `verifySpecTree(snapshot, review?)`: widen `review` from one `SeriesSnapshot` to the
    expected series collection (proposal; type name decision left to B002). Collect each
    review task's `reviewerProfiles`, derive expected series via `seriesNames`, and pass
    to `verifyReviewLink`. Keep the one-review-task-per-phase check (lines 261–268).
  - Tests: `src/modules/structure/tests/verify-spec-tree.test.ts` (+ `helpers.ts`).
- `src/modules/scaffold/scaffold.module.ts`
  - `ScaffoldTask` (proposal): add `reviewerProfiles?: ReadonlyArray<string>`;
    `ScaffoldSpecInput` (proposal): add `reviewerProfiles?: ReadonlyArray<string>`.
  - `renderReview(phase, id, profiles)` (proposal signature change): emit the
    `reviewer-profiles:` line; `renderSpecScaffold` passes it through.
  - Tests: `src/modules/scaffold/tests/scaffold.test.ts`.
- `src/apps/cli/cli.apps.module.ts` — the production producer of `ScaffoldTask`, omitted
  from the earlier list.
  - `parseScaffoldTask` (`:635-653`) parses the `name[:type[:gates]]` grammar and returns
    `{ name, type, gates }`; extend the grammar (or `ScaffoldOptions`) with a
    reviewer-profiles token, or add a `--reviewer-profiles` flag.
  - `scaffold` (`:664-714`) threads `tasks` into `renderSpecScaffold` (`:698-705`) with no
    profile input; `createCommand` (`:803-843`) exposes no profile flag. Thread the parsed
    profiles through `scaffold` → `renderSpecScaffold`.
  - Tests: `src/apps/cli/tests/create.test.ts` — add a case asserting the emitted review
    task's `reviewer-profiles:` line (and the empty default), alongside the existing
    `renderSpecScaffold`/`parseScaffoldTask` coverage.
- `src/skills/executing-spec.ts`
  - Rewrite `EXECUTING_SPEC` lines 25–28: close the phase with one review task; spawn one
    reviewer session **per expected series** (general + each declared profile) via
    `review_create`, each writing round `<NNN>` of its own series
    (`.agents/@montflow/reviews/<series>/<NNN>/REVIEW.md`), same `NNN` in every series.

**`pi-reviews`** (`packages/pi-reviews/`)

- `src/modules/review/review.module.ts`
  - `SeriesScaffold` (proposal): add `profile?: string`; `renderSeries` emits
    `- Profile: <name>` between `Rounds` and `Created` (the position `authoringRules()`
    already documents). `SERIES_META_FIELDS` stays `['Target','Status','Rounds','Created']`
    — `Profile` remains optional; `parseSeries`/`verifySeriesFile` already validate a
    single optional slug and need no change.
  - `authoringRules()`: clarify one profile per series and the profile-named series.
  - Tests: `src/modules/review/tests/verify-series.test.ts`.
- `src/apps/dispatch/review-dispatch.apps.module.ts`
  - `ReviewDispatchInput` (proposal): add `profile?: string` and a round target
    (`round?: string` / `phase?: string`) so the reviewer hits the convention round by
    `roundForPhase`, not "next free round". **`ensureSeries` returns early when the ledger
    already exists** (`review-dispatch.apps.module.ts:72-75`), so "pass `profile` into
    `renderSeries`" only stamps a *freshly created* ledger. The documented scaffold flow
    (`mf-reviews create` scaffolds the series and its first round; dispatch then "ensures
    the series ledger exists") therefore never writes `Profile:` on a pre-created ledger,
    and `verifySeries` → `ProfileProbe` is skipped. `ensureSeries` must stamp/merge
    `Profile:` onto an existing ledger when `input.profile` is set (or fail loudly when an
    existing unstamped ledger cannot be stamped) — it cannot rely on creation-only
    rendering. `reviewerPrompt` names the exact round and the profile; `startReview`
    applies the profile's model/thinking (B002).
  - `Session.newId(`${input.name}-review`)` stays unique because each series name is
    unique.
  - Tests: `src/apps/dispatch/tests/review-dispatch.test.ts`.
- `src/extension.ts`
  - `review_create` tool `parameters` (proposal): add `profile` and `thinking`
    (`thinking` is currently a dead `ReviewDispatchInput` field per A002); pass `profile`
    into the dispatch input. Tests: extension tests.
- `src/apps/cli/engines.apps.module.ts`
  - `ScaffoldFields` (proposal): add `profile?: string`; `scaffold` passes it to
    `renderSeries`. `verifySeries` needs no change (already probes the single ledger
    `Profile`), and now runs once per profile series.
  - Tests: `src/apps/cli/tests/engines.test.ts` — the `declareProfile` note "the field has
    no CLI flag" must be updated.
- `src/apps/cli/binary.apps.module.ts`
  - `createFlags` (proposal): add `profile: optionalString('profile', …)`; pass to
    `Engines.scaffold` in `createCommand` and `newCommand`.
- `src/apps/cli/slash.apps.module.ts`
  - `parseCliArgs` `create`/`new` known set `['target','round','dir']` → add `'profile'`;
    `CliAction.Create` (proposal) gains `profile`; the `run` Create case passes it.
- `src/apps/cli/renderers.apps.module.ts`
  - `USAGE` already advertises `mf-reviews create <name> … [--profile <name>]` (line 20)
    while no flag accepts it today (A001). Note the two help surfaces are **already**
    inconsistent: this `USAGE` mentions `--profile` but `slash.apps.module.ts`
    `COMMAND_DESCRIPTION` (line 22) and slash `USAGE` (line 26) do not. Once the flag
    lands, align both surfaces, not just `COMMAND_DESCRIPTION`.

**Workspace integration** (`apps/workspace/`) — the sole production caller that supplies a
review series to `verifySpecTree`.

- `src/services/specs/specs.services.module.ts`
  - `readReviewSeries(root, name)` (`:86-93`) reads exactly one series directory named after
    the spec; widen it to read one series per expected profile
    (`seriesNames(specName, profiles)`) and return the collection.
  - `inspect()` (`:221-224`) passes a single `review` snapshot to
    `libs.Structure.verifySpecTree`; pass the collection (matching the widened
    `verifySpecTree` signature) so the verifier can report a missing round per series.
  - `buildResumeContext` (`:618-627`) hard-codes one `${seriesName(id)}/${round}` path per
    phase under the header "Phase reviews (convention: series shares the spec name)";
    render one path line per series (general + each declared profile), each marked
    `(missing)` independently.
  - `executeSpec` (`:691-719`) calls `readReviewSeries` and feeds the result into
    `buildResumePrompt` (`:705-708`); it must read and pass the collection.
  - Tests: `src/services/specs/tests/execute-flow.test.ts` (`:127` asserts the single
    `ship-login/001 (missing)` line; `:139-142` asserts one `phase A` issue for series
    `ship-login`) — update to assert one line/issue per expected series.
- **Which command enforces the review link today:** only this workspace caller passes a
  series. `mf-specs check` calls `verifySpecTree(snapshot)` with no `review` argument
  (`packages/pi-specs/src/apps/cli/cli.apps.module.ts:104,187`), so the `pi-specs` CLI never
  supplies a series and the link is not enforced from the command line; the workspace app
  supplies exactly one. Phase C must decide whether `mf-specs check` should read and pass
  the expected series set, or document that link enforcement lives only in the workspace.
  Without either, the SPEC requirement "the review-link verifier … reports a missing round
  per series and phase" is unreached from the CLI, and Phase C's own unit tests can pass
  while the panel and the orchestrator's resume context still see one series.

**Docs and changelogs**

- `packages/pi-specs/README.md` — `Task`, `Scaffold`, `Structure`, `SpecSkill` bullets
  (lines 58–98) gain the field and the per-profile series behavior.
- `packages/pi-reviews/README.md` — Commands block (lines 50–58) adds `--profile`;
  Dispatch block (lines 63–80) adds `profile=`; the Profile paragraph (lines 82–87) notes
  one profile per series.
- `packages/pi-specs/skills/montflow-create-pi-specs/SKILL.md` (lines 48, 87, 103) and
  its `CHANGELOG.md`: the appended review task now may carry `reviewer-profiles`.
- `packages/pi-reviews/skills/montflow-adversarial-review/SKILL.md` (line 69 `<name>`,
  line 235 `Profile:`) and its `CHANGELOG.md`: note the series is profile-named when one
  is bound (only if the wording changes).
- Migration note (SPEC requirement): a documented note that existing specs/series with no
  declared profiles are unchanged.
- Changesets/changelogs: this repo has **no** package `CHANGELOG.md`; both packages are
  `"private": true`, `.changeset/config.json` sets `privatePackages.version:false` and
  ignores `@montflow/pi-reviews`. `@montflow/pi-specs` is private but not ignored, so at
  most a changeset for it is due — B003/C005 decide (mirrors the montflow-ci-verification
  C007 conclusion). No `.agents/documentation/` entry covers review dispatch; adding one
  is B003's call.

### 5. Risk table

| Risk | Likelihood | Impact | Resolved by |
| ---- | ---------- | ------ | ----------- |
| Unknown/missing profile reference | Medium (typos, removed profile dir) | Medium — review never runs or verify never passes | B (B001 semantics, B002 verify point); C001 |
| Existing specs with no declared profiles stop verifying/dispatching | Certain if mishandled — this repo has many | High — repo-wide verify failure | B (B001 back-compat rule); C002 |
| Round-number drift across series (a lazily created profile series writes round `001` when the phase expects `003`) | High — dispatch today says "write the next round" | Medium — verifier reports a missing convention round | B (B002 round targeting); C003 |
| `F<n>` / `finding-ref` ambiguity across series (`defect` tasks reference bare `F<n>`) | High once profiles are used | High — a defect fixes the wrong finding | B (B001 must qualify `finding-ref` per series or mandate distinct id ranges — §1; A001 open question) |
| Profile `model`/`thinking` not applied (effect-reviewer pins no model; `Profile` has no `thinking` field) | High — SPEC requires "profile's model and thinking applied" | Medium — reviewer runs on the wrong model | B (B002 dispatch), B003 (pin) |
| Profile `skills` never loaded (no session sink) | High — no `skills` on `SessionRunnerStartInput`/`Session` | Medium — specialist reviewer lacks its skills | B002 (prompt-prepend vs new input) |
| Cross-spec series-name ambiguity from hyphen joining | Low | Medium — two specs' reviews merge | B001 (accept or add a marker) |
| `--profile` advertised in `USAGE` but no flag accepts it (pre-existing, A001) | Certain until C | Low — confusing CLI | C005 (CLI + docs) |

### 6. `effect-reviewer` binding decision input

- **Which phases declare it:** code-producing phases only. In practice a phase that
  holds at least one `execution` (or `defect`) task. In **this** spec, Phase C
  (`C001`–`C005`, execution) — bind it on the phase's review task
  `C099-review-phase/TASK.md` as `reviewer-profiles: effect-reviewer`. Exploratory
  Phase A and planning Phase B keep an empty list ⇒ general reviewer only; their `A099`
  and `B099` review tasks are untouched.
- **Replaces or joins:** it **joins** the general reviewer (per SPEC). The declared
  profile is additive; the unprofiled general reviewer always runs the default series.
  So `C099` (phase rank `C` → round `003`) expects round `003` in **both**
  `montflow-multi-reviewer` (general) and
  `montflow-multi-reviewer-effect-reviewer` (effect-reviewer), each ledger stamped with
  its own `Profile:` (none / `effect-reviewer`).
- **Open inputs to B/B003:** effect-reviewer's `model:` is empty today (A002), so B003
  decides a pin or inherited model; `Profile` has no `thinking` field, so B002 decides
  where thinking comes from. The profile's `skills` currently reach nothing; B002 decides
  the sink.

## Open Questions

- **B001 (decide-series-and-profile-convention):** confirm the field name
  `reviewer-profiles` and comma-separated wire format; confirm declared profiles are
  additive (join) with an always-implicit general reviewer; confirm the series
  composition `<spec>-<profile>` and whether the cross-spec ambiguity is accepted or
  disambiguated; decide whether the default series is always required alongside profile
  series; **resolve the cross-series `F<n>` / `finding-ref` id space** (qualify
  `finding-ref` per series with a `FINDING_REF_PATTERN` change and migration, or mandate
  distinct id ranges per series — see §1).
- **B002 (decide-dispatch-and-verification):** how profile `model`/`thinking` reach a
  session (and whether `Profile` gains a `thinking` field); how `skills` reach a session
  (prompt-prepend à la `pi-prompts executeFor`, or a new `skills` input); the
  `review_create` surface (`profile`, `thinking`, exact-round/phase); the dispatch loop
  (one session per profile, order); the `verifySpecTree` review-parameter shape and the
  per-series/per-phase round check; the failure point for an unknown profile —
  `verifyTaskFile` can only check `SLUG_PATTERN`, so the choice is stamp/verify at series
  creation vs a spec↔profiles integration check (§2).
- **B003 (plan-rollout-and-migration):** the documented migration note (SPEC
  requirement); whether to backfill `reviewer-profiles` onto existing specs and this
  spec's `C099`; the effect-reviewer model pin; docs/changelog/changeset rollout and the
  `C001`–`C005` ordering.

## Handoff

- Feeds Phase B (B001 series-and-profile-convention, B002 dispatch-and-verification, B003 rollout-and-migration).

## Deviations

- None.
