---
name: montflow-multi-reviewer
status: in-progress
workspace-type: in-place
author: Daniel Montilla
created: 2026-10-13
locked-phases:
  - A
  - B
---

# Montflow multi-reviewer reviews

## Description

A spec phase ends with exactly one `review` task, and that task maps to exactly
one review round. The convention in
`packages/pi-specs/src/modules/review-link/review-link.module.ts` binds the spec
name to one review series and the phase rank to one round (`A` → `001`), and a
review series carries at most one optional `Profile:` in its ledger
(`packages/pi-reviews/src/modules/review/review.module.ts`,
`SERIES_META_FIELDS`). Dispatch spawns a single reviewer session and takes no
profile at all (`packages/pi-reviews/src/apps/dispatch/review-dispatch.apps.module.ts`).
So a phase cannot be reviewed by two reviewers with different profiles: a second
review task in the same phase still collapses to the same round, and a second
reviewer has nowhere to write findings without colliding on the round file and
the global `F<n>` finding ids.

Add multi-reviewer support: a review task may declare a list of reviewer
profiles, each reviewer runs the existing `montflow-adversarial-review` skill
against its own series, and the spec links to one series per profile. This keeps
each reviewer isolated and reuses the review artifact standard unchanged. It
also lands the concrete first use: bind the existing `effect-reviewer` profile
(`.agents/@montflow/profiles/effect-reviewer/PROFILE.md`) to phases that produce
code, alongside a general reviewer, so the code a phase writes is audited for
idiomatic Effect v4 and not only for generic defects.

The work spans `@montflow/pi-specs` (the task contract, the review link, the
scaffold, the execution skill), `@montflow/pi-reviews` (profile-aware dispatch
and ledger metadata), and the workspace docs and changelogs. It is spec-tooling
and is independent of the `montflow-opencode-migration` spec.

## Requirements

- A review task can declare an ordered list of reviewer profiles; an empty list preserves today's single-reviewer behavior exactly.
- A spec owns one review series per reviewer profile: the default series keeps the spec name, each additional profile gets a slug-safe series name derived from the spec name and the profile, and a phase's review lands on the same round number in every series (the phase rank is the preferred round number, used when it is free in every expected series).
- A review round records the phase it reviews, and the review link attributes each round to a phase: a completed phase review must have a round attributed to that phase in every expected series.
- The review-link verifier accepts a set of expected series and reports a missing round per series and phase; it never forces a single series when profiles are declared. The series-free repo gate (`verify:montflow:specs`) does not enforce the link; the collection-carrying verifier runs in the workspace caller.
- Dispatch starts one reviewer session per profile, each running the unchanged `montflow-adversarial-review` skill against its own series, with the profile's model and thinking applied and the series ledger `Profile:` stamped.
- The `effect-reviewer` profile is bound to phases that produce code by declaring it in those phases' review tasks; exploration and planning phases keep a general reviewer only.
- The scaffold emits the profile list on the generated review task, and the task-contract verifier accepts the new field without weakening existing checks.
- Profile references are resolved against the profiles store; an unknown profile is a verifiable failure, not a silent single-reviewer fallback. `verify:montflow:reviews` resolves every spec's declared profiles (profiles are committed, so the check is CI-safe and needs no review series).
- Existing specs and review series keep working: a spec with no declared profiles verifies and dispatches exactly as before, and the change ships with a documented migration note.
- Phases A and B modify no file outside `.agents/@montflow/specs/`; Phase C implements the changes and every execution task passes its `GATES.md`.

## Tasks

| ID   | Name                               | Type        | Status  | Gates |
| ---- | ---------------------------------- | ----------- | ------- | ----- |
| A001 | explore-review-pipeline            | exploratory | complete | No    |
| A002 | explore-profile-binding            | exploratory | complete | No    |
| A003 | synthesize-multi-reviewer-contract | exploratory | complete | No    |
| A099 | review-phase                       | review      | complete | No    |
| B001 | decide-series-and-profile-convention | planning  | complete | No    |
| B002 | decide-dispatch-and-verification   | planning    | complete | No    |
| B003 | plan-rollout-and-migration         | planning    | complete | No    |
| B099 | review-phase                       | review      | complete | No    |
| C001 | implement-spec-profile-field       | execution   | complete | Yes   |
| C002 | implement-multi-series-review-link | execution   | complete | Yes   |
| C003 | implement-profile-aware-dispatch   | execution   | pending | Yes   |
| C004 | update-orchestration-and-skills    | execution   | pending | Yes   |
| C005 | migrate-series-and-docs            | execution   | pending | Yes   |
| C099 | review-phase                       | review      | pending | No    |
