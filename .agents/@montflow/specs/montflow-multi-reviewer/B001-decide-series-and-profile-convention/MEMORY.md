# Memory

## Context

Task B001: decide the exact convention for declaring reviewer profiles on a review
task and for naming the resulting series, so the review-link verifier and dispatch
agree. A003 §1–§3 and its B001 open question are the starting proposals; this task
confirms or changes each with reasons and rejected alternatives.

Evidence read in full: `A001-explore-review-pipeline/MEMORY.md` (review pipeline and
the two collision mechanics), `A002-explore-profile-binding/MEMORY.md` (profile
contract, `ProfileProbe`, dispatch has no profile), `A003-synthesize-multi-reviewer-contract/MEMORY.md`
(consolidated contract, §1–§3, §5 risk table). Naming/validation facts re-verified in
source: `packages/pi-specs/src/modules/spec/spec.module.ts` (`SLUG_PATTERN`,
`isValidName`, `slugify`), `packages/pi-specs/src/modules/frontmatter/frontmatter.module.ts`
(`parseMarkdown` key regex, `fieldList`), `packages/pi-specs/src/modules/task/task.module.ts`
(`FINDING_REF_PATTERN`, `Task`, `taskInput`, `verifyTaskFile`), `packages/pi-specs/src/modules/review-link/review-link.module.ts`
(`seriesName`, `roundForPhase`, `reviewPhases`, `verify`), and
`packages/pi-reviews/src/modules/review/review.module.ts` (`SLUG_PATTERN`,
`isValidName`, `slugify`, `SERIES_META_FIELDS`, `parseSeries`, `renderSeries`).
No file outside `.agents/@montflow/specs/` was touched; no tests were run (planning task,
no gates).

## Progress

- 2026-10-13: complete.

## Findings

### 1. Review-task declaration — field, order, default, wire format

**Decision.** Add one optional frontmatter field to `TASK.md`:

- **Field name: `reviewer-profiles`** (NEW; confirmed from A003 §2 — no such field
  exists in `pi-specs` today, verified: no `reviewer-profiles`/`reviewerProfiles`
  symbol in `packages/pi-specs/src`). Export constant
  `REVIEWER_PROFILES_FIELD = 'reviewer-profiles'` from
  `packages/pi-specs/src/modules/task/task.module.ts` (decided).
- **Schema position:** `Task` gains `reviewerProfiles: Schema.Array(...)` after
  `relatedTasks` and before `findingRef`; on-disk frontmatter order becomes
  `id, name, type, originator, depends-on, related-tasks, reviewer-profiles, finding-ref, status`.
  (A003 said "after `related-tasks`, before `status`"; this is that, with the rare
  optional `finding-ref` remaining adjacent to `status`.)
- **Order is significant.** The list is ordered and closed (SPEC: "an ordered list of
  reviewer profiles"). Order determines the dispatch sequence (B002) and the order of
  the per-series lines in the resume context; it does **not** change any derived series
  name (each is derived independently from `(specName, profile)`).
- **Duplicates are a verifiable failure.** A repeated profile would derive the same
  series twice (see §2), so `verifyTaskFile` reports a duplicate `reviewer-profiles`
  entry. This is decided here because it is a series-collision matter.
- **Empty/absent default:** absent, empty-value (`reviewer-profiles:` with no items), and
  empty-scalar all normalize to `[]`. `[]` means **general reviewer only** — today's
  single-reviewer behavior exactly (SPEC: "an empty list preserves today's
  single-reviewer behavior exactly").
- **Wire format:** the canonical form is the **comma-separated scalar**
  (`reviewer-profiles: effect-reviewer, generic-reviewer`), matching how
  `depends-on`/`related-tasks` are already written. The YAML `- item` list is also
  accepted by the parser but is not canonical.
- **Parser compatibility (verified).** `parseMarkdown` in
  `frontmatter.module.ts:39` matches keys with `/^([\w-]+):\s*(.*)$/`, so the
  hyphenated `reviewer-profiles` key parses. `fieldList` (`:85-96`) splits a scalar on
  `,`, trims, and drops blanks, and also returns an empty array for a blank-value key
  followed by no `- item` lines. So both wire formats and the empty default work with
  the existing parser; no frontmatter change is required.

Example (this spec's Phase C review task):

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

**Rationale / evidence.** A001 change point 1 (`Task`/`TaskInput`/`taskInput`/
`verifyTaskFile` have no profile field) and change point 13 (`renderReview` emits no
profile list); A003 §2. SPEC requirement "A review task can declare an ordered list of
reviewer profiles; an empty list preserves today's single-reviewer behavior exactly."
`checklist`/`skills` in `PROFILE.md` are a different surface (A002), not reused here.

### 2. Derived series naming

**Decision — exact composition** (in `packages/pi-specs/src/modules/review-link/review-link.module.ts`):

- **Default series:** `seriesName(specName) = specName` — identity, unchanged
  (`review-link.module.ts:37`; A003 §3, SPEC back-compat requirement).
- **Profile series:** `profileSeriesName(specName, profile) = `${specName}-${profile}``
  (NEW; confirmed from A003 §3). Composition is the literal join of the two slugs with
  a single `-`. `slugify` is retained only for defensive callers; it is not needed on
  the decided path.
- **Expected series set:** `seriesNames(specName, profiles) = [seriesName(specName),
  ...profiles.map((p) => profileSeriesName(specName, p))]` — the default series first,
  then the profile series **in declared order** (order is significant for presentation
  and dispatch, §1). NEW; confirmed from A003 §3.
- **The default (no-profile) series is always required** alongside every profile series.
  A phase with a review task always expects the spec-name series, plus one series per
  declared profile. The declaration is **additive (join, not replace)**: the declared
  profiles cannot displace the general reviewer. Decided (A003 §2/§6; SPEC: "each
  *additional* profile gets a slug-safe series name"; "exploration and planning phases
  keep a general reviewer only").

**Every name is slug-valid (proof).** `SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/`
is identical in `spec.module.ts:9` and `review.module.ts:25`. If `A` and `B` each match
`SLUG_PATTERN`, then `A-B` matches: `A` ends in `[a-z0-9]` and `B` begins in
`[a-z0-9]`, so inserting one `-` neither creates `--` nor leaves a leading/trailing
hyphen. Spec names and profile names are each already validated against it (profiles:
`parseSeries`/`isValidName` and `Profile.name` matching its directory — A002). Hence
`specName`, `profileSeriesName(specName, profile)`, and every element of
`seriesNames` are slug-valid.

**Collision-freeness within one spec.** The default `s` differs from every `s-p`
(a non-empty suffix was appended); distinct profiles `p ≠ q` give `s-p ≠ s-q`. With
duplicates rejected (§1), the expected series set of one spec has no internal collision.

**Cross-spec ambiguity — resolved by deciding to ACCEPT it.** A003 §3 flagged the general
shape: two *different* specs can compose the same series name because `-` is both the
separator and a legal character inside a component. It is not only profile-vs-profile
(spec `a-b` + profile `c` and spec `a` + profile `b-c` both compose `a-b-c`); the more
reachable form is profile-vs-**default** — spec `foo` declaring profile `bar` composes
`foo-bar`, which is exactly the default series (`seriesName = specName`) of a second spec
literally named `foo-bar`. In general a profile series `<spec>-<profile>` collides with
the default or profile series of any sibling spec whose name is composed the same way.
Decided: accept, do not add a disambiguating marker. Rationale:

1. **No injective slug-safe encoding exists.** The only characters `SLUG_PATTERN`
   permits are `[a-z0-9]` and `-`; a `-` also occurs *inside* both components, and a run
   of two hyphens (`--`) is rejected by `SLUG_PATTERN`. Any marker drawn from the
   permitted alphabet is itself a valid slug fragment, so it cannot separate the two
   components injectively — every candidate scheme is partial.
2. **Series are never looked up by name alone across specs.** Both readers resolve a
   series with the spec name in hand: the verifier is given the spec name and its
   declared profiles (`verifySpecTree`), and dispatch is started for one spec and one
   profile (`ReviewDispatchInput.name`/`profile`). The collision only matters if a
   *third* spec's name happens to be `a` and declares `b-c` while `a-b` declares `c`.
3. **Bounded, low-probability impact.** A003 §5 rates it Low likelihood / Medium
   impact; it is confined to one workspace's `.agents/@montflow/reviews/`.
4. **A real fix is a layout change, not a naming change.** Full disambiguation would
   require spec-scoped series (`reviews/<spec>/<profile>/…`), which collides with the
   existing round-directory namespace (`<series>/<NNN>/`) and is out of scope.

B003 records this accepted limitation in the migration note.

### 3. Phase-to-round mapping and per-round phase attribution

**Decision — every spec-phase round is attributed to the phase that wrote it.** A strict
"phase rank = round number" cannot hold once the fix→re-review loop is in play: the
reviewer always writes a **new** round per pass
(`.agents/skills/montflow-adversarial-review/SKILL.md` Step 0), so one phase occupies
several rounds in a series. In this very spec the default series already holds rounds
`001`–`003` written by Phase A's loop, and Phase B's review is round `004` (not `002`).
Decided:

- **New optional round-metadata field `Phase:`** (round-grammar change; mechanics in
  B002 §3): every round written by a spec-phase review or its fix→re-review loop records
  the phase it reviews (`- Phase: B`). Validated by `verifyRoundFile`
  (`packages/pi-reviews/src/modules/review/review.module.ts`) when present; optional, so
  standalone reviews are unchanged.
- **`roundForPhase(phase)` is the *preferred* round number**, unchanged
  (`review-link.module.ts:45`): the phase's review uses it when that round is free in
  every expected series. When it is already occupied (an earlier phase's loop overran
  into it), the orchestrator selects the smallest round `>= roundForPhase(phase)` free in
  **every** expected series and passes that same number to every series, so the phase's
  review still lands on one identical round across the spec's series.
- **The verifier binds by attribution, not by number.** A completed phase review requires
  a round attributed `Phase: <phase>` in each of `seriesNames(specName, profiles)`, and
  the attributed round numbers must agree across those series. B002 §3 fixes the exact
  issue text, the `SeriesSnapshot` shape, and the completion scoping.

**Rationale / evidence.** A001 change points 2, 5 (round is derived and shared) and A003
§3. Attribution is the only signal that distinguishes Phase A's loop round `002` from
Phase B's review round; presence of a number cannot. The alternative — a strict rank
mapping plus forbidding the loop from writing new rounds — contradicts the
adversarial-review skill's contract and the observed history of this spec, and is
rejected (B002 §5).

### 4. How an unknown profile is reported

**Decision — layered reporting, no pi-specs dependency.** (`verifyTaskFile` cannot resolve
a real profile: `@montflow/pi-specs` depends only on `@effect/platform-node` —
`packages/pi-specs/package.json:41-43` — and must not gain a profiles dependency. Real
resolution lives in `@montflow/pi-reviews`, which already depends on
`@montflow/pi-profiles`. A003's F6 correction stands.)

1. **Syntactic fail point — pi-specs, pure.** `verifyTaskFile` validates every
   `reviewer-profiles` entry against `SLUG_PATTERN` (and rejects duplicates, §1). A
   malformed entry (e.g. `Effect_Reviewer`, `EffectReviewer`) is an issue
   `[reviewer-profiles] '<x>' is not a profile slug.` This is the *only* check
   `pi-specs` can make; it must not resolve real profiles.
2. **Existence fail point — pi-reviews, exercised by `verify:montflow:reviews`.**
   `mf-reviews verify --all` (`package.json:30`) resolves **every** spec's declared
   `reviewer-profiles` against the profiles store and fails on an unknown profile
   (`Declared reviewer profile '<x>' was not found under .agents/@montflow/profiles.`).
   It fires for any declared profile — a valid slug naming no profile, with or without a
   series, and whether the review task is `pending` or `complete` (B002 §2, F9). Profiles
   (`.agents/@montflow/profiles`) and specs (`.agents/@montflow/specs`) are committed, so
   the check is CI-safe; review series are **not** needed (they are gitignored).
3. **Semantic fail point — pi-reviews series verify.** Every profile series ledger
   carries exactly one `Profile: <profile>` (stamped at series creation/ensure by
   dispatch; B002 owns the mechanism and fixes the `ensureSeries` early-return so a
   pre-created ledger is stamped too — A003 §4). `verifySeries` then calls
   `ProfileProbe.verify(name, cwd)` and reports `failed` as an issue
   `[profile] Profile '<name>' failed verification: …`, `unavailable` as a warning
   (`engines.apps.module.ts:292-304`; `profile-probe.services.module.ts`). An unknown
   profile is a series-verify failure, never a silent single-reviewer fallback.
4. **Dispatch fail point — earliest and loudest.** Dispatch resolves each declared
   profile against the profiles store before spawning any session; an unknown profile
   aborts that series' dispatch with an error result and starts no session (never falls
   back to the general reviewer). B002 fixes the exact resolution call and string.

**Rejected:** adding a spec↔profiles integration check inside `pi-specs` (would force
a profiles dependency into `pi-specs`, violating its layering); making `mf-specs check`
link-aware (F17 — review series are gitignored, so a repo-wide gate can never require
one); and relying on dispatch alone (leaves a declared-but-unresolvable profile invisible
to `verify` until run time). The tiers above make "unknown profile is a verifiable
failure" true without either compromise (SPEC requirement): every declared profile is
resolved by tier 2 regardless of task status or series existence, and tier 3 probes the
series ledger once one exists.

### 5. Resolving the `F<n>` / bare `finding-ref` id space across series

**Decision.** `finding-ref` on a `defect` task becomes a **fully-qualified locator**:

```
<series>/<round>/F<n>            e.g. montflow-multi-reviewer-effect-reviewer/003/F1
```

and `FINDING_REF_PATTERN` changes from `/^F\d+$/` (`task.module.ts:21`) to
`/^[a-z0-9]+(?:-[a-z0-9]+)*\/\d{3}\/F\d+$/` (NEW pattern; decided). `Task.findingRef`
(`:95`) and the `verifyTaskFile` issue text (`:256-259`) are updated with it
(message: `Must be a finding reference like '<series>/<round>/F1'.`).

**Why fully qualified, not A003's `<series>#F<n>`.** A003 §1 proposed series-only
qualification. That is insufficient: `parseFindings`' `seenIds` is per round file
(`review.module.ts:365,383-393`) and the series index is keyed `Round | ID`
(`:953-963`), so `F1` **repeats across rounds within one series**. `<series>#F1` would
still name more than one finding. The locator above mirrors the artifact path
(`.agents/@montflow/reviews/<series>/<round>/REVIEW.md`, finding `F<n>` — A001 change
point 4) and is the minimum that uniquely identifies a finding once series-per-profile
widens the id space. The series part matches `SLUG_PATTERN`; the round part matches
`ROUND_PATTERN`; `/` and `#` are outside the slug alphabet, so the pattern is unambiguous.

**What this does not change.** The round-file grammar (`### F1`, the `Round | ID`
index) is untouched — only the `defect`-side reference changes. A `defect` task still
carries exactly one string; it now names the series and round instead of a bare id.

**Migration cost.**

- **In this repo: zero existing values.** Verified — no `TASK.md` under
  `.agents/@montflow/specs` carries `finding-ref:`; the only `findingRef`/`finding-ref`
  occurrences are unit-test fixtures in
  `packages/pi-specs/src/modules/task/tests/{parse-task-file,verify-task-file,helpers}.ts`.
  So C001's cost is the pattern, the schema/verify text, and updating those fixtures
  (`'F2'` → e.g. `'ship-login/002/F2'`, `'nope'` stays invalid, `'F'` stays invalid).
- **Downstream specs:** each existing `finding-ref: F<n>` is rewritten once to
  `<series>/<round>/F<n>`, where `<series>` is that spec's default series (its spec
  name) and `<round>` is the finding's round directory. A mechanical, per-value rewrite;
  B003 documents it as the migration note.
- **Authoring flow:** whichever skill/prompt creates `defect` tasks must emit the
  qualified form (no `defect`-authoring surface references `finding-ref` in this repo
  today — grep found none — so C004/B003 own any skill wording).

**Rationale / evidence.** A001 §"Notes on the two collision mechanics" (finding id is
per-round, and the bare ref has no series/round qualifier); A003 §1 (B001's explicit
obligation to resolve, not claim disjointness); SPEC phasing; A003 §5 rates the
ambiguity High/High. Option (b) (distinct numeric ranges per series) is rejected in §6.

### 6. Rejected alternatives

| Alternative | Why rejected |
| ----------- | ------------ |
| **One shared series, many profiles on one ledger / one round** | Round-file overwrite: every path is `<series>/<round>/REVIEW.md` and nothing else keys a round (A001 collision 1; `ReviewStore`/`roundPath`). A ledger carries at most one `Profile:` (`SERIES_META_FIELDS` excludes it; `parseSeries` validates a single value — A001 change point 8). Two reviewers collide on the file and the `F<n>` space. |
| **Same round file, reviewers append** | Same overwrite, plus intra-round `F<n>` collision (`parseFindings` `seenIds` is per file). |
| **Distinct `F<n>` id ranges per series (A003 option b)** | Weak enforcement: reviewers write ids freely and would have to be told their block; ranges need allocation per spec; the verifier would have to know the allocation; and it does not touch the round axis either. A qualified locator (§5) is enforced by a pattern. |
| **A003's `<series>#F<n>` (series-only qualifier)** | Not unique: `F<n>` repeats across rounds of one series (see §5). Superseded by the `<series>/<round>/F<n>` locator. |
| **Two structured fields (`review-series` + `review-round`) beside a bare `F<n>`** | Valid alternative (no pattern change) but larger schema surface for the same result; a single locator mirrors the artifact path and keeps `finding-ref` one value. |
| **Cross-spec series disambiguation marker** | Impossible to make injective within `SLUG_PATTERN` (only `[a-z0-9-]`; `--` forbidden). Accepted as a documented low-probability limitation instead (§2). |
| **Spec-scoped series layout (`reviews/<spec>/<profile>/…`) to remove cross-spec ambiguity** | Collides with the round-directory namespace (`<series>/<NNN>/`) and changes the artifact layout/store; out of scope for a convention decision. |
| **Declared profiles *replace* the general reviewer** | Contradicts SPEC ("each *additional* profile"; "exploration and planning phases keep a general reviewer only") and breaks the empty-list back-compat default. |
| **Let `verifyTaskFile` resolve real profiles** | `pi-specs` has no profiles dependency and must not gain one (layering; A003 §2). Real resolution lives in `pi-reviews` `ProfileProbe` and in dispatch (§4). |
| **Order-insignificant list** | SPEC requires an ordered list; order drives the dispatch sequence and resume-context line order. |
| **YAML `- item` list as the canonical wire format** | The comma-separated scalar matches existing `depends-on`/`related-tasks` authoring and the scaffold; both remain parseable, only the scalar is canonical. |

## Open Questions

- **B002:** the dispatch-side mechanism for §4 (where a declared profile is resolved
  against the profiles store; the exact error string), and how the series ledger's
  `Profile:` is stamped when the ledger already exists (`ensureSeries` returns early —
  A003 §4). *Resolved by B002 §1a/§2.*
- **B002:** whether `mf-specs check` should pass the expected series set to
  `verifySpecTree` or link enforcement stays workspace-only
  (`apps/workspace/src/services/specs/specs.services.module.ts`; A003 §4). *Resolved by
  B002 §3/§5 (F17): `mf-specs check` stays series-free; only the workspace caller supplies
  the collection. Unknown-profile enforcement lives in `mf-reviews verify --all` (§4
  tier 2, B002 §2).*
- **B003:** the documented migration note for the accepted cross-spec collision (§2),
  the per-round `Phase:` stamp on existing rounds (B002 §3), and the `finding-ref`
  rewrite (§5); whether to backfill `reviewer-profiles` onto existing specs and this
  spec's `C099`; the `effect-reviewer` model pin (A002).

## Handoff

- Feeds B002 decide-dispatch-and-verification; B003 plan-rollout-and-migration.

## Deviations

- None.
