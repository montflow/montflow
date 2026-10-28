# Memory

## Context

Task B003: the last planning task of `montflow-multi-reviewer`. It decides how the
multi-reviewer change (B001/B002) rolls out without breaking existing specs and review
series, records the concrete `effect-reviewer` binding for code phases, orders Phase C
(`C001`–`C005`), and fixes the migration note, the docs/changelog rollout, and the
verification that closes the spec.

Evidence read in full: the spec `TASK.md`/`SPEC.md`; `A001`/`A002`/`A003` MEMORYs;
`B001`/`B002` MEMORYs; `C001`–`C005` `TASK.md` + `GATES.md`; `C099` `TASK.md`. Repo
release/changelog reality re-verified in source: root `package.json` (`changeset:publish`
at `:18`), `.changeset/config.json` (`ignore` `:9-20`, `privatePackages` `:21-24`),
`packages/pi-specs/package.json` (private, deps only `@effect/platform-node`),
`packages/pi-reviews/package.json` (private, deps include `@montflow/pi-profiles`; C003 adds
`@montflow/pi-specs` for the F9 pass),
`apps/workspace/package.json` (`@montflow/workspace`; C002 adds `@montflow/pi-reviews` so it
reads each round's `Phase:` via `Review.parseRound`, F20). Also verified: the sole review
series `.agents/@montflow/reviews/montflow-multi-reviewer/` (rounds `001`–`003`, no
`Profile:` in its ledger); **zero** `type: defect` tasks and **zero** `finding-ref:`
values under `.agents/@montflow/specs/`; the per-skill `CHANGELOG.md` inventory;
`packages/pi-reviews/scripts/generate-embedded-skills.ts` and
`packages/pi-reviews/src/apps/doctor/tests/embedded-payload.test.ts`;
`.agents/@montflow/profiles/effect-reviewer/PROFILE.md` (empty `model:`, 7 skills,
10-item checklist); `packages/pi-reviews/src/apps/cli/{binary,engines,renderers}.apps.module.ts`
(`createFlags.round`, `Engines.scaffold` explicit-round path). No file outside
`.agents/@montflow/specs/` was touched; no tests were run (planning task, no gates).

## Progress

- 2026-10-13: complete.

## Findings

### 1. Backward-compatibility guarantee for specs and series with no declared profiles

**Decision — a spec/series with no declared profiles is behaviorally identical to
today.** Enumerated against the SPEC back-compat requirement:

- **Task-contract verification.** With `reviewer-profiles` absent, blank, or empty,
  `taskInput`/`fieldList` normalize to `[]` (B001 §1); `verifyTaskFile` adds no issue and
  no new failure (B002 §4).
- **Review-link verification.** `seriesNames(specName, [])` returns exactly
  `[specName]` (B001 §2). It binds by **phase attribution**: a `complete` review task must
  have a round carrying `- Phase: <phase>` (B002 §3). This check runs **only in the
  workspace caller** (F17): the repo gate `mf-specs check` stays series-free, so a spec
  with no series verifies under `verify:montflow:specs` exactly as before. The workspace
  reads `Phase:` through `@montflow/pi-reviews`' `Review.parseRound` (F20), so the round
  `## Metadata` grammar is not re-derived. A no-profiles
  spec that verifies today still has a round at `roundForPhase(phase)`; adding the
  `- Phase:` line is the only content change (a migration step, §2d item 6). **A textual
  change too:** the workspace link issue text is the new per-series/attribution wording
  and the old "series name is X but the convention names it Y" check is dropped (B002 §3).
  Consumers asserting the exact string are updated by C002
  (`apps/workspace/src/services/specs/tests/execute-flow.test.ts`, B002 §4).
- **Dispatch.** `review_create` called without `profile`/`round`/`phase` passes
  `undefined`; `ensureSeries` leaves an existing ledger's metadata untouched (B002 §2.4);
  one session, id `<name>-review`, `REVIEW_TOOLS`, and the same prompt (the new `- Profile:`/
  `- Round:`/`- Phase:` context lines render only when set, B002 §1e). A standalone review
  without `phase`/`profile` also skips the F13/F15 checks (B002 §1a).
- **Series naming.** `seriesName(specName) = specName` — identity, unchanged
  (`packages/pi-specs/src/modules/review-link/review-link.module.ts`).
- **Rounds.** `roundForPhase(phase) = String(phaseRank(phase)).padStart(3,'0')` is the
  preferred round number, shared by every series; attribution is the binding identity
  (B001 §3, B002 §3).
- **Finding-refs.** The one non-identical field: `FINDING_REF_PATTERN` changes from
  `/^F\d+$/` to the qualified `<series>/<round>/F<n>` locator (B001 §5). This breaks no
  spec in this repo (verified: no `type: defect` task and no `finding-ref:` value under
  `.agents/@montflow/specs/`), but a downstream spec using a bare `finding-ref` must
  rewrite it once (§2d/§5 migration note).

So the guarantee is: **no-profiles specs are byte-compatible in the shipped gates**
(`verify:montflow:specs` is series-free, so it does not change); the review-link issue
wording changes only inside the workspace caller; `verify:montflow:reviews` gains a
declared-profile resolution that no existing spec trips (all are profile-free, §2a); and
the only other break is `defect`'s `finding-ref`, which has no in-repo instances.

### 2. Migration for existing specs and existing series

**(a) No existing review task gains `reviewer-profiles`.** The field is new (B001 §1);
no review task in any spec declares one today. `montflow-ci-verification`,
`montflow-project-structure`, and `montflow-spec-standard` review tasks keep an
absent/empty list ⇒ general reviewer only. This is the SPEC back-compat requirement in
practice: their completed reviews have no series on disk, and because `verify:montflow:specs`
is series-free (F17) they still verify clean.

**(b) This spec's `C099` DOES declare `effect-reviewer`.** It is the concrete first use
(SPEC Description; A003 §6). `.agents/@montflow/specs/montflow-multi-reviewer/C099-review-phase/TASK.md`
gains, between `related-tasks` and `status` (B001 §1), the canonical comma-separated
scalar line `reviewer-profiles: effect-reviewer`. **No backfill** onto completed specs:
seeding a profile series with a round a past review never wrote would fabricate review
history, and the SPEC binds `effect-reviewer` to code phases *going forward*.

**(c) How a new profile series is seeded, and when its round is written.** Use the reviews
CLI scaffold for the **ledger only** — no placeholder round. C003 adds `--profile`
(B002 §6). For this spec, C005 runs exactly:

```
bun run --cwd packages/pi-reviews cli create \
  montflow-multi-reviewer-effect-reviewer --profile effect-reviewer --dir $PWD
```

This creates the series ledger stamped `- Profile: effect-reviewer` (`renderSeries` via
`ScaffoldFields.profile`, B002 §2) and **no round**. The default `montflow-multi-reviewer`
series is **not** re-seeded — it already carries rounds `001`–`003` from Phase A's loop;
C005 also stamps `- Phase: A` on rounds `001`–`003` and `- Phase: B` on round `004`
(migration, §2d item 6). C005's gate is therefore **the profile ledger, not the round**:
`verify:montflow:reviews` passes for a ledger-only profile series (`ProfileProbe` resolves
`effect-reviewer`, and the declared-profile resolution of B002 §2 finds it), and
`verify:montflow:specs` is series-free (F17) and never reads a round, so it passes with
C099 still `pending` and no C round written. No placeholder is needed to make either gate
green before C099 runs. Round `003` is a
*preference*, not a requirement: when C099 dispatches, the orchestrator computes the
phase's target round as the smallest round `>= roundForPhase('C')` (= `003`) free in **both**
expected series, and passes that same number to both `review_create` calls (B002 §1e); each
reviewer writes it with `- Phase: C`. Because the default series already holds `001`–`004`,
the target is the smallest round `>= 003` free in both (B002 §3). **No empty placeholder is
seeded** — the old plan seeded round `003` so the link check passed before C099 (F10/F11);
a fabricated round must never satisfy a review gate.

**Caution — skill wording (C004).** `montflow-adversarial-review` Step 0 computes "next
round = highest existing + 1" and Step 9 says it "always writes a new round, never edits an
existing one". C004 makes the dispatcher's explicit round authoritative and specifies the
wording: *when the dispatch names an exact round for a series, write that round; if only an
empty scaffold exists at that round, populate it in place; never create a higher round
instead. With no explicit round, keep highest + 1.* This keeps standalone reviews working
and lets a phase review hit the orchestrator's target round. C004 also writes the
`- Phase: <phase>` metadata into the round (B002 §3). A round already present at the target
number and attributed to a **different** phase is never overwritten — that is exactly why
the orchestrator computes the next round free in every series rather than hard-coding
`roundForPhase`. C004 precedes the ledger creation and migration (C004 → C005).

**(d) Migration-note text/placement (SPEC requirement).** Canonical note is a
`## Migration: multi-reviewer reviews` section in **`packages/pi-specs/README.md`** (the
`reviewer-profiles`/`finding-ref` owner), with a one-line cross-reference from
`packages/pi-reviews/README.md`. No package `CHANGELOG.md` exists to host it. The note
states:

1. No declared profiles ⇒ unchanged (the §1 guarantee).
2. New optional `reviewer-profiles: <a>, <b>`; each profile adds series
   `<spec>-<profile>` at the same round; the general reviewer always runs `<spec>` (join).
3. **`finding-ref` rewrite:** a bare `finding-ref: F<n>` becomes
   `<series>/<round>/F<n>` (e.g. `ship-login/002/F2`); the accepted grammar is
   `/^[a-z0-9]+(?:-[a-z0-9]+)*\/\d{3}\/F\d+$/`. Zero values exist in this repo.
4. **Accepted cross-spec series collision** (B001 §2): two *different* specs can compose
   the same series name because `-` is both separator and a legal character inside a
   component. The reachable form is profile-vs-**default**: spec `foo` + profile `bar`
   composes `foo-bar`, which is the default series of a sibling spec literally named
   `foo-bar`; profile-vs-profile (spec `a-b` + profile `c` vs spec `a` + profile `b-c`) is
   the other form. No injective marker is possible within `SLUG_PATTERN`. Accepted, low
   likelihood: both the verifier and dispatch always hold the spec name.
5. **Per-round `Phase:` attribution** (B002 §3, B001 §3). Every spec-phase round records
   the phase it reviews (`- Phase: <phase>`). The review link attributes a **completed**
   phase review to a round carrying that phase in every expected series, and requires the
   round number to agree across series. This link is consumed by the **workspace verifier**
   only; the repo spec gate is series-free (F17). The phase rank is the *preferred* round
   number only; because the fix→re-review loop writes a new round per pass, an earlier
   phase's loop can occupy a later phase's rank, so a phase whose preferred round is taken
   writes the next round free in every series (this spec: A = `001`–`003`, B = `004`, C =
   the next common free round). No fabricated or empty round is ever seeded.
6. **Stamping existing rounds.** The `montflow-multi-reviewer` default series' existing
   rounds `001`–`003` predate the field; C005 adds `- Phase: A` to them (they are Phase A's
   reviews — the ledger's `Target` confirms it) and `- Phase: B` to round `004`. This is
   accurate attribution, not fabricated review history, and is required for A's and B's
   completed review tasks to verify in the workspace link consumer (the repo gate does not
   read rounds).

### 3. The `effect-reviewer` binding

- **Which phases declare it:** code-producing phases only — a phase holding at least one
  `execution` (or `defect`) task (A003 §6; SPEC requirement). Exploration and planning
  phases keep an empty list ⇒ general reviewer only. In this spec only Phase C
  (`C001`–`C005` are `execution`) declares it; `A099`/`B099` are untouched.
- **Join, not replace.** The declaration is additive: B001 §2 fixes that the default
  series `seriesName(specName)` is **always** required alongside every profile series, so
  a declared profile cannot displace the general reviewer. `C099` expects a round
  attributed `- Phase: C` in both `montflow-multi-reviewer` (general, ledger `Profile:`
  absent) and `montflow-multi-reviewer-effect-reviewer` (`Profile: effect-reviewer`), at
  the same round number — the orchestrator's computed target (smallest round `>= 003` free
  in both series, B002 §1e); `003` is only the preference.
- **`model` pin decision: INHERIT — do not pin.**
  `.agents/@montflow/profiles/effect-reviewer/PROFILE.md` keeps `model:` empty. Rationale:
  (i) B002 §1b already fixed the precedence `profile.model (non-empty) > input.model`
  precisely so a blank profile falls back to the dispatch model
  (`modelLabelOf(ctx.model)`), and `effect-reviewer` is the named blank-model case;
  (ii) a pin would bind a workspace-scoped profile to one provider/model and break
  `effect-reviewer` wherever that model is unavailable; (iii) the profile's value is its
  instructions/skills/checklist, not a model; SPEC's "the profile's model and thinking
  applied" is satisfied by applying the resolved model (and its `thinkingLevel`) via
  B002 §1c. **No `Profile` schema change and no `thinking` field** (B002 §5).
- **Concrete declaration for this spec's Phase C review task**, applied by C005
  (`C099-review-phase/TASK.md`):

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

- **Field-name authority note.** `C001` and `C004` `TASK.md` prose say "the `profiles`
  field"; the decisive on-disk key is **`reviewer-profiles`** (B001 §1, confirmed against
  the `fieldList` grammar in
  `packages/pi-specs/src/modules/frontmatter/frontmatter.module.ts`). "profiles" in those
  task texts is shorthand and must not become a second key; C001/C004 use
  `reviewer-profiles`.

### 4. Ordered Phase C execution

Dependency order (task frontmatter + B002 §6 change list): **C001 → C002 → C003 → C004 →
C005 → C099** (review). `C099` has no task-graph dependency but cannot run before C005
lands its declaration and profile-series ledger.

**Producer/consumer order (F18).** C002 owns both the per-round `Phase:` grammar producer
(`RoundScaffold.phase`/`renderRound`/`verifyRoundFile`) and the attribution consumer (the
workspace verifier), so no consumer lands before its producer; C003 no longer owns the
round grammar. `mf-specs check` is not a consumer at all (series-free, F17). The `Phase:`
data producers after C002 are C004 (the reviewer's `- Phase:` line) and C005 (stamping the
existing rounds), which only matter to the workspace when it reads the live repo — the
workspace tests use fixtures carrying `Phase:` literals.

| # | Task | Change (files) | Cut criterion | Rollback | Verification scope |
|---|------|----------------|---------------|----------|--------------------|
| 1 | **C001** `implement-spec-profile-field` | `Task.reviewerProfiles`/`TaskInput`/`taskInput`/`REVIEWER_PROFILES_FIELD`, `verifyTaskFile`, `FINDING_REF_PATTERN`, `ScaffoldTask`/`renderReview`, CLI `--reviewer-profiles` (`packages/pi-specs/src/modules/task/task.module.ts`, `.../scaffold/scaffold.module.ts`, `.../apps/cli/cli.apps.module.ts`) | `C001/GATES.md` stages 0+1 all checked; new unit tests green; package lint/format/ts/test clean | `git revert` the C001 commit; absent field ⇒ `[]` ⇒ §1 guarantee restored | `@montflow/pi-specs` |
| 2 | **C002** `implement-multi-series-review-link` | `SeriesRoundSnapshot`/`SeriesSnapshot`/`ReviewTaskEntry`/`verify`, `verifySpecTree` collection, `Phase:` round grammar (`RoundScaffold.phase`/`renderRound`/`verifyRoundFile`), workspace `readReviewSeries`/`inspect`/`buildResumeContext`/`executeSpec`, and the `@montflow/pi-reviews` dependency (`packages/pi-specs/src/modules/review-link/review-link.module.ts`, `.../structure/structure.module.ts`, `packages/pi-reviews/src/modules/review/review.module.ts`, `apps/workspace/src/services/specs/specs.services.module.ts`, `apps/workspace/package.json`) | `C002/GATES.md` checked; review-link/structure/round-grammar/execute-flow tests green | revert commit; single-`SeriesSnapshot` link restored; `Phase:` grammar removed; workspace reads no `Phase` | `@montflow/pi-specs` + `@montflow/pi-reviews` + `@montflow/workspace` |
| 3 | **C003** `implement-profile-aware-dispatch` | dispatch `profile`/`round`/`phase` + resolve-validate-before-`ensureSeries` (F13/F15), `ensureSeries` stamp/merge (F4), `reviewerPrompt`, `review_create` params + `ProfileStore.Default`, `SeriesScaffold.profile`/`renderSeries`, pi-reviews CLI `--profile`, and `verifySpecProfiles`/`verifyAll` declared-profile resolution + `SpecStore.Default`/`ProfileStore.Default` layers + the `@montflow/pi-specs` dependency (F9) (`packages/pi-reviews/src/apps/dispatch/review-dispatch.apps.module.ts`, `.../extension.ts`, `.../modules/review/review.module.ts`, `.../apps/cli/{binary,slash,engines,renderers}.apps.module.ts`, `packages/pi-reviews/package.json`) | `C003/GATES.md` checked; tests incl. the F4 pre-created-ledger regression, unknown-profile-no-session/no-series, name mismatch (with and without `spec`), the F9 declared-profile resolution, and the `renderSeries` round-trip green | revert commit; dispatch stops reading profile/round/phase; no stamping; no spec-profile resolution | `@montflow/pi-reviews` |
| 4 | **C004** `update-orchestration-and-skills` | `EXECUTING_SPEC` (one session per series, computed exact round + phase), `AUTHORING_SPEC` (field), `.agents/skills/montflow-adversarial-review/SKILL.md` + packaged copy + regenerate embed, `.agents/skills/montflow-create-pi-specs/SKILL.md` (`packages/pi-specs/src/skills/{executing,authoring}-spec.ts`, `.agents/skills/...`, `packages/{pi-specs,pi-reviews}/skills/...`) | `C004/GATES.md` checked; embedded-payload test green; `verify:montflow:skills` green | revert skill text and re-run `generate:payload` | `@montflow/pi-specs` + `@montflow/pi-reviews` + `verify:montflow:skills` |
| 5 | **C005** `migrate-series-and-docs` | `C099` `reviewer-profiles: effect-reviewer`; create the `montflow-multi-reviewer-effect-reviewer` **ledger** with `- Profile:` (no round); stamp `- Phase: A` on rounds `001`–`003` and `- Phase: B` on `004`; README migration sections; skill `CHANGELOG`s; spec state | `C005/GATES.md` checked; `verify:montflow:specs` (series-free, F17) and `verify:montflow:reviews` (resolves C099's `effect-reviewer`) pass; workspace link test green | revert spec/series/docs; delete the created profile series | `verify:montflow:specs` + `verify:montflow:reviews` + `@montflow/workspace` |
| — | **C099** `review-phase` | runs after C005; general + effect-reviewer sessions | both expected series carry the computed round attributed `- Phase: C`; findings written | n/a (review artifact) | n/a |

### 5. Documentation, changelog, and closing verification

**Docs (C004/C005):** `packages/pi-specs/README.md` (`Task` and `Scaffold` bullets + the
`## Migration` note), `packages/pi-reviews/README.md` (`--profile` in Commands,
`profile=` in Dispatch, one-profile-per-series note + migration cross-ref); `AUTHORING_SPEC`
and `EXECUTING_SPEC` (`packages/pi-specs/src/skills/{authoring,executing}-spec.ts`). Skills
changed by C004 are edited in both copies (`.agents/skills/<name>/` and
`packages/<pkg>/skills/<name>/`) because `verify:montflow:skills` checks the workspace
copy and `packages/pi-reviews/src/apps/doctor/tests/embedded-payload.test.ts` asserts the
packaged copy matches the embedded payload byte-for-byte (regenerate with
`bun run --cwd packages/pi-reviews generate:payload`).

**Changelog.** The only changelogs in the repo are per-skill
(`packages/*/skills/<name>/CHANGELOG.md` and the mirrored
`.agents/skills/<name>/CHANGELOG.md`). Both packages are `"private": true`;
`.changeset/config.json` lists `@montflow/pi-reviews` in `ignore` and sets
`privatePackages.version:false`; the root publish script filters to
`@montflow/core`/`@montflow/format` (`package.json:18`). **Decision:** update the
`CHANGELOG.md` of every changed skill (`montflow-adversarial-review`,
`montflow-create-pi-specs`) in both copies, and **create no package `CHANGELOG.md` and no
changeset file** — mirroring the `montflow-ci-verification` C007 conclusion — with the
reason recorded in C005's memory.

**Verification that closes the spec:**
- Per package (AGENTS.md): `bun run --cwd packages/pi-specs test` /
  `bun run --cwd packages/pi-reviews test`, plus `ts:check`/`lint:check`/`format:check`
  per touched package (root form: `turbo <task> --filter=@montflow/pi-specs`).
- Spec tree: `bun run verify:montflow:specs` (`mf-specs cli check --dir $PWD`) → zero
  issues. `check` stays **series-free** (F17): it calls `verifySpecTree(snapshot)` with no
  `review`, so `montflow-ci-verification` and `montflow-project-structure` (complete review
  tasks, no series on disk) verify exactly as before.
- **The link is proven by the workspace caller**, the only production code that supplies
  the collection for the panel and the resume context:
  `apps/workspace/src/services/specs/specs.services.module.ts` `inspect` → `verifySpecTree`,
  with each round's `Phase:` read via `@montflow/pi-reviews`' `Review.parseRound` (the new
  `apps/workspace` dependency, F20), asserted by `bun run --cwd apps/workspace test`
  (`src/services/specs/tests/execute-flow.test.ts`, updated by C002 per B002 §4: one
  line/issue per expected series, including a declared-profile case).
- Reviews: `bun run verify:montflow:reviews` (`mf-reviews verify --all --dir $PWD` +
  `doctor --check`) → both series verify, the profile ledger passes `ProfileProbe`, and
  every spec's declared `reviewer-profiles` resolves against the committed profiles store
  (F9: an unknown profile fails here regardless of task status or series existence).
- Skills: `bun run verify:montflow:skills`.
- Final repo gate: `bun run verify:montflow`.

### 6. Per-task verification scope

`@montflow/pi-specs` = `packages/pi-specs`, `@montflow/pi-reviews` = `packages/pi-reviews`,
`@montflow/workspace` = `apps/workspace` (each confirmed in its `package.json`). Scopes:
C001 → `@montflow/pi-specs`; C002 → `@montflow/pi-specs` + `@montflow/pi-reviews` +
`@montflow/workspace`; C003 → `@montflow/pi-reviews`; C004 → `@montflow/pi-specs` +
`@montflow/pi-reviews` (+ `verify:montflow:skills`); C005 → `verify:montflow:specs` +
`verify:montflow:reviews` + `@montflow/workspace`. From the root use
`turbo <task> --filter=<package>`; from a shell
use `bun run --cwd <pkg-path> <script>`. Never repo-wide; never invoke tool binaries
directly (AGENTS.md). Phase B runs no tests.

## Open Questions

- None.

## Handoff

- Feeds B099 review-phase; then Phase C C001–C005.

## Deviations

- None.
