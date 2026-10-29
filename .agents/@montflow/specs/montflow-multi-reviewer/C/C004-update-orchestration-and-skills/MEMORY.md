# Memory

## Context

Task C004: update the execution flow and the skills so a spec phase closes by
spawning one reviewer session **per declared profile / per expected series**,
each against its own series. The decisive contract is B002 §1 (one
`review_create` call per expected series, each carrying the **same** computed
`round`, the `phase`, and that series' `profile`; the reviewer writes the round),
§1e (the orchestrator owns round selection: preferred `roundForPhase`, next
round free in every series otherwise) and §6 (the two rows owned by C004); B001
§2 (series naming `seriesName` / `profileSeriesName` / `seriesNames`, default
series first) and §3 (`Phase:` round attribution, `roundForPhase` is a
preference); and B003 §2c/§4 (the skill's explicit-round authority and the
`- Phase:` line; the effect-reviewer binding; the packaged-skill/freshness
mechanics). C001–C003 are complete and committed; C004 implements only its own
rows — no C003 dispatch edits, no C005 migration/series.

Implemented in `packages/pi-specs` and `packages/pi-reviews`, plus the two
installed skill mirrors under `.agents/skills/`. Read: `skills/executing-spec.ts`,
`skills/authoring-spec.ts`, `packages/pi-specs/skills/montflow-create-pi-specs/`,
`skills/montflow-adversarial-review/{SKILL,GATES,CHANGELOG}.md`,
`apps/dispatch/review-dispatch.apps.module.ts`, `extension.ts`,
`modules/review/review.module.ts` (`ROUND_META_FIELDS`, `authoringRules`),
`apps/doctor/{embedded-payload.test.ts,doctor.apps.module.ts}`,
`apps/doctor/tests/run-doctor.test.ts`, `packages/pi-skills`'
`skill-docs.test.ts` (the existing mirror/version drift pattern), and the
B001/B002/B003 MEMORYs. No file outside `.agents/@montflow/specs/`, the two
packages, and `.agents/skills/` was touched.

## Progress

- 2026-10-15: complete. All scoped gates green (see Findings §5).

## Findings

### 1. Orchestration — `EXECUTING_SPEC` (`packages/pi-specs/src/skills/executing-spec.ts`)

- The phase-close bullet now spawns one reviewer session **per expected review
  series**: the spec's own `<name>` series (general reviewer, always present)
  plus one `<name>-<profile>` series per slug the review task's
  `reviewer-profiles` list declares. Dispatch is `review_create` once per series,
  passing `spec: <name>`, that series' `profile` (omitted for the spec's own
  series), and the **same** `round` and `phase` on every call (B002 §1f).
- New bullet fixes the round semantics: target `roundForPhase(phase)`
  (`A` → `001`, `B` → `002`) when it is free in **every** expected series, else
  the smallest round `>= roundForPhase(phase)` free in every series, so the phase
  is reviewed at one identical round across all series. Each reviewer runs
  `montflow-adversarial-review`, writes
  `.agents/@montflow/reviews/<series>/<round>/REVIEW.md` recording
  `- Phase: <phase>` in its metadata, and keeps the ledger in step.

### 2. Adversarial-review skill (packaged source + embedded payload + mirror)

- `packages/pi-reviews/skills/montflow-adversarial-review/SKILL.md` Step 0 gains
  a dispatch-contract paragraph: a spec phase may be backed by **more than one
  series**, one per declared reviewer profile; an orchestrator-supplied
  `- Round: <NNN>` is **authoritative** (write that round; populate an existing
  empty scaffold in place; never create a higher round; never overwrite a round
  holding findings); with no explicit round, keep highest + 1; a named
  `- Phase: <phase>` is recorded as `- Phase:` in the round's `## Metadata`.
- The round-file `## Metadata` sample now lists the optional
  `- Phase: <phase id>` line (matching `authoringRules()`), and "Write the Files"
  step 1 states the explicit-round / empty-scaffold / `- Phase:` rules. The round
  format and the finding lifecycle are otherwise unchanged (B003 §2c).
- `GATES.md` Phase 3 gains three gates: the explicit round was written (empty
  scaffold populated in place, no overwrite), a series-backed dispatch wrote to
  the named series (one pass per expected profile series), and a phase review
  records `- Phase:`. Frontmatter version `5.0.0 → 5.1.0` with a `CHANGELOG.md`
  entry.
- Regenerated `embedded-payload.generated.ts` (`bun run --cwd packages/pi-reviews
  generate:payload`) and ran `mf-reviews doctor` to refresh the installed
  `.agents/skills/montflow-adversarial-review` mirror; `doctor --check` is clean.

### 3. Authoring / create-spec contract

- `AUTHORING_SPEC` (`packages/pi-specs/src/skills/authoring-spec.ts`) extends the
  existing `reviewer-profiles` sentence: each entry adds a `<spec>-<profile>`
  series, the phase's review round is written to **every** expected series at the
  same round, and `effect-reviewer` is declared on **code phases** (any phase
  holding an `execution` or `defect` task); exploration and planning phases stay
  empty (B003 §3, the C001 field sentence extended).
- `packages/pi-specs/skills/montflow-create-pi-specs/SKILL.md` (the canonical
  packaged create-spec skill) now lists `reviewer-profiles` in the scaffold
  command, the scaffold bullet list, the `TASK.md` frontmatter, and the reference
  flag list, and documents the field + the `effect-reviewer` binding.
  Frontmatter version `2.1.0 → 2.2.0` with a `CHANGELOG.md` entry. The installed
  `.agents/skills/montflow-create-pi-specs` mirror is synced byte-for-byte.

### 4. Drift guards

- **`packages/pi-reviews/src/apps/doctor/tests/skill-drift.test.ts`** (new):
  guards the adversarial-review `SKILL.md` against the round grammar — every
  `ROUND_META_FIELDS` label and the optional `Phase` field must appear as
  `- <label>:` in both the skill and `authoringRules()`, and the skill must state
  the explicit-round and per-profile-series dispatch contract. (The packaged copy
  is already held to the embed byte-for-byte by `embedded-payload.test.ts`.)
- **`packages/pi-specs/src/skills/tests/skill-drift.test.ts`** (new): guards the
  instruction files against the shared `REVIEWER_PROFILES_FIELD` constant — the
  injected `AUTHORING_SPEC`/`EXECUTING_SPEC` and the packaged create-spec skill
  must name `reviewer-profiles` (and `effect-reviewer` / `--reviewer-profiles`);
  mirrors the `pi-skills` `skill-docs.test.ts` pattern by asserting each packaged
  spec skill matches its `.agents/skills` mirror byte-for-byte and that its
  frontmatter version equals the newest changelog entry.

### 5. Gate results

From the repo root, package scripts only:

- `bun run --cwd packages/pi-specs test` → **pass** — 54 files / 368 tests, no
  type errors.
- `bun run --cwd packages/pi-specs ts:check` / `lint:check` / `format:check` →
  **pass** (extra: the skill text and drift test live in this package).
- `bun run --cwd packages/pi-reviews test` → **pass** — 24 files / 154 tests, no
  type errors.
- `bun run --cwd packages/pi-reviews ts:check` → **pass** — `tsc --noEmit`.
- `bun run --cwd packages/pi-reviews lint:check` → **pass** — 0 warnings, 0
  errors.
- `bun run --cwd packages/pi-reviews format:check` → **pass** (after one
  `format:fix` run to capture the SKILL.md emphasis and the new test).
- `bun run verify:montflow:reviews` → **pass** — `8 files · 0 issues` and
  `doctor --check` clean.
- `bun run verify:montflow:specs` → **pass** — `4 specs · 0 failed · 0 issues`.
- `bun run verify:montflow:skills` → **pass** (extra, freshness) — `46 skills ·
  0 issues` and doctor clean.

## Open Questions

- **C005:** the `C099` `reviewer-profiles: effect-reviewer` line, the
  `montflow-multi-reviewer-effect-reviewer` ledger, and the `- Phase: A`/`- Phase:
  B` stamp on rounds `001`–`004`. C004 only writes the instruction the C099
  reviewer follows.

## Handoff

- The orchestrator instruction (`EXECUTING_SPEC`) and the reviewer instruction
  (`montflow-adversarial-review`) now agree with the C002/C003 code contract on
  the round/phase/profile dispatch. C005 seeds the first declared profile and the
  series; C099 runs once per expected series and writes the same computed round
  attributed `- Phase: C`.

## Deviations

- **Installed create-spec mirror synced by hand.** `mf-specs doctor` is
  install-only — `installSkill` returns `present` and leaves an existing copy
  untouched — so it will not refresh `.agents/skills/montflow-create-pi-specs`.
  The installed copy was `cp`-synced from the packaged source (they are
  byte-identical; the new pi-specs drift test asserts it). No behavioural
  difference from the task's "refreshed via `mf-specs doctor`" wording.
- **Two drift tests added, not one.** C004 requires "add or update the tests or
  checks that guard the instruction files against the constant". No existing
  pi-specs/pi-reviews test compared skill text to a shared constant, so a
  focused guard was added on each side (the pi-reviews round grammar; the
  pi-specs `REVIEWER_PROFILES_FIELD` + repo-mirror/version pattern mirrored from
  `pi-skills`). Additive; no existing test weakened.
- **`authoringRules()`/round grammar untouched.** The `- Phase:` producer
  (`RoundScaffold.phase`, `renderRound`, `verifyRoundFile`) and
  `authoringRules()` landed in C002; C004 only writes the reviewer's instruction
  to record `- Phase:`. No code-contract change was needed here.
