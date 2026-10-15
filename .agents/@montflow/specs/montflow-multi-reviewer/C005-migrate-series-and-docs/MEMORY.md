# Memory

## Context

Task C005: the last execution task of `montflow-multi-reviewer`. It applies the
B003 rollout plan to the live repo — declare `effect-reviewer` on the Phase C
review task, seed the `montflow-multi-reviewer-effect-reviewer` profile series as
a **ledger only** (no round), stamp the pre-existing Phase A/B rounds with their
phase, land the migration docs, and close the spec under its gates.

Evidence read in full: the C005 `TASK.md` + `GATES.md`; `C099-review-phase/TASK.md`;
`B003-plan-rollout-and-migration/MEMORY.md` §1–§6; `B001-decide-series-and-profile-convention/MEMORY.md`
§1/§2/§3/§5; the spec `SPEC.md`; the live default series
`.agents/@montflow/reviews/montflow-multi-reviewer/` (ledger `Rounds: 7`, rounds
`001`–`007`); the profile source `.agents/@montflow/profiles/effect-reviewer/PROFILE.md`;
the two package READMEs; the two changed skills' `SKILL.md` frontmatter +
`CHANGELOG.md`. Repo reality re-verified in source:
`packages/pi-reviews/src/apps/cli/engines.apps.module.ts` (`ScaffoldFields.round/profile`
`:460-468`, `nextRoundNumber` `:479`, `scaffold` `:488-557` — it **always** writes a
round and indexes it, `:532-542`), `packages/pi-reviews/src/apps/cli/binary.apps.module.ts`
(`createFlags.profile` `:140`, `create`/`new` `:144-168`),
`packages/pi-reviews/src/apps/cli/renderers.apps.module.ts` (`USAGE` `:13-24`),
`packages/pi-reviews/src/modules/review/review.module.ts` (`RoundScaffold.phase`
`:1020-1021`, `renderRound` emits `- Phase:` `:1039`, `renderSeries` `:1083-1105`,
`renderRoundsTable` `:986-994`, `renderFindingsTable` `:1001-1008`,
`verifyRoundFile` `Phase` `:600-607`), `packages/pi-specs/src/modules/task/task.module.ts`
(`REVIEWER_PROFILES_FIELD` `:24`, `FINDING_REF_PATTERN` `:21`, review-only +
slug + duplicate checks `:263-271`), `packages/pi-specs/src/modules/scaffold/scaffold.module.ts`
(`ScaffoldSpecInput.reviewerProfiles` `:53`, `renderReview` `:171-181`),
`packages/pi-specs/src/modules/memory/memory.module.ts` (`MEMORY_SECTIONS`).
Two `todo`-free files only: the plan is fixed, so no file outside the ones below
changed. Gates run via package scripts (AGENTS.md): the pi-specs check,
`verify:montflow:{specs,reviews,skills}`, `packages/pi-specs format:check`, and the
specs link tests in `apps/workspace`.

## Progress

- 2026-10-15: complete.

## Findings

### 1. `C099` declares `effect-reviewer`

Added the canonical scalar line `reviewer-profiles: effect-reviewer` between
`related-tasks:` and `status:` in
`.agents/@montflow/specs/montflow-multi-reviewer/C099-review-phase/TASK.md` (the
schema position fixed by B001 §1). `status` stays `pending`. `mf-specs check`
accepts it: `verifyTaskFile` validates each entry against `SLUG_PATTERN`, and the
real `effect-reviewer` resolution is `mf-reviews verify --all`'s declared-profile
pass (B001 §4 tier 2) — which is green here (finding 6).

### 2. The profile series is seeded ledger-only — no fabricated round

Ran exactly the B003 §2c command:

```
bun run --cwd packages/pi-reviews cli create \
  montflow-multi-reviewer-effect-reviewer --profile effect-reviewer --dir $PWD
```

`Engines.scaffold` is round-creating by contract (`engines.apps.module.ts:501,532,534`),
so it wrote a placeholder `001/REVIEW.md` and led the ledger with `- Rounds: 1` and a
`| 001 | open | … |` row. Because a fabricated round must never satisfy a review gate
(B003 §2c), the mise-en-place was undone locally (the reviews store is gitignored):

- removed `.agents/@montflow/reviews/montflow-multi-reviewer-effect-reviewer/001/`;
- set the ledger `- Rounds: 1` → `- Rounds: 0`;
- deleted the `| 001 | open | 0 | 0 | 0 | 0 | 0 |` row from `## Rounds` (the
  `## Findings` index was already empty).

The resulting ledger is a faithful index of zero rounds: `# Review Series:
montflow-multi-reviewer-effect-reviewer`, `## Metadata` with `- Target: …`,
`- Status: open`, `- Rounds: 0`, `- Profile: effect-reviewer`, `- Created: 2026-10-15`,
and empty `## Rounds` / `## Findings` tables. `verify:montflow:reviews` accepts a
zero-round ledger (finding 6): the profile series passes `ProfileProbe`, and nothing
requires a round.

### 3. Stamped every pre-existing round with its phase

In each round's `## Metadata`, immediately after its `- Round:` line, added
`- Phase: A` to rounds `001`–`003` (their `Target` is "Phase A exploratory
artifacts") and `- Phase: B` to rounds `004`–`007` (their `Target` is "Phase B
decisions…"). B003 §2d item 6 named only `001`–`003` and `004` because rounds
`005`–`007` — the F9/F13/F17/F18/F19/F20 re-reviews — postdate B003. Applying the
item's stated principle ("accurate attribution … every spec-phase round records
the phase it reviews") to the current on-disk set means they are stamped too; round
`004` alone would already satisfy the workspace link for B099's completed review,
but leaving `005`–`007` bare would make the repo contradict the migration note
written in finding 4. `verifyRoundFile` validates `Phase` as an optional phase id
(`review.module.ts:600-607`), so the stamps are checked, not decorative.

### 4. Migration docs

**`packages/pi-specs/README.md`** (the `reviewer-profiles`/`finding-ref` owner):
added the canonical `## Migration: multi-reviewer reviews` section with the five
B003 §2d points (no-profiles unchanged; additive `reviewer-profiles: <a>, <b>` →
`<spec>-<profile>` series at the same round with the general `<spec>` reviewer
always present; the `finding-ref` → `<series>/<round>/F<n>` rewrite and its
`/^…\/\d{3}\/F\d+$/` grammar; the accepted cross-spec collision; per-round `Phase:`
attribution and the preferred-round-not-required rule). Also brought the `Task`
and `Scaffold` bullets up to date (`REVIEWER_PROFILES_FIELD`,
`FINDING_REF_PATTERN`, `ScaffoldSpecInput.reviewerProfiles`) — B003 §5 assigns
these to C004/C005 and C004 left them un-updated.

**`packages/pi-reviews/README.md`**: `create` gains `[--profile <name>]` in
Commands, `review_create` gains `[profile=<name>]` in Dispatch, and a
one-profile-per-series note plus a one-line cross-reference to the pi-specs
migration section were added.

`packages/pi-specs format:check` initially failed on the new prose; `oxfmt`
normalised `*preferred*` → `_preferred_`, after which it is green.

### 5. Changelog / changeset decision

C005 changes no skill, so no skill `CHANGELOG.md` entry is due; verified against
frontmatter that the C004 entries are correct: `montflow-adversarial-review`
`5.1.0` and `montflow-create-pi-specs` `2.2.0` (both copies — `.agents/skills/…`
and `packages/*/skills/…` — agree). No package `CHANGELOG.md` and no changeset:
both packages are `"private": true`, `.changeset/config.json` lists
`@montflow/pi-reviews` in `ignore` and sets `privatePackages.version:false`, and
the root publish script filters to the untouched, release-gated `@montflow/format`.

### 6. Gate results

- `bun run --cwd packages/pi-specs cli check --name montflow-multi-reviewer --dir $PWD`
  → `1 spec · 0 failed · 0 issues`.
- `bun run verify:montflow:specs` → `4 specs · 0 failed · 0 issues`.
- `bun run verify:montflow:reviews` → `9 files · 0 issues`; doctor clean (the
  zero-round profile ledger is file #9 and verifies).
- `bun run verify:montflow:skills` → `46 skills · 0 issues`; doctor clean.
- `bun run --cwd apps/workspace test -- src/services/specs/tests/execute-flow.test.ts`
  → 2 files, 12 tests passed (the review-link proof B003 §5 names).
- Full `bun run --cwd apps/workspace test` fails on unrelated pre-existing
  environment state (no `@montflow/format` build → `TypeCheckError: Cannot find
  module '@montflow/format'`; "Prompts extension not found"); C005 touches none of it.

## Open Questions

- None.

## Handoff

- Feeds C099 review-phase: the Phase C review writes one round attributed
  `- Phase: C` into **both** `montflow-multi-reviewer` and
  `montflow-multi-reviewer-effect-reviewer`, at the computed target (smallest round
  `>= 003` free in both; `003` is only the preference — B002 §1e/B003 §3).

## Deviations

- B003 §2d item 6 named rounds `001`–`003` (`Phase: A`) and `004` (`Phase: B`);
  rounds `005`–`007` postdate it and are Phase B re-reviews, so they are stamped
  `- Phase: B` too (justified extension, not a fabrication — their `Target` states
  Phase B). See finding 3.
- The pi-specs `Task`/`Scaffold` README bullets were updated in addition to the
  required `## Migration` section (B003 §5 assigns those to C004/C005; C004 did not
  land them). See finding 4.
- The full `apps/workspace` suite has pre-existing failures unrelated to C005 (an
  unbuilt `@montflow/format` and a missing prompts extension); the scoped specs
  link tests pass. See finding 6.
