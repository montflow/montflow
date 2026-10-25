# Memory

## Context

Task A099: independent adversarial review of Phase A (the A001/A002 inventories
and the A003/A004 verifier changes). Run as a fresh, isolated reviewer under the
`montflow-adversarial-review` skill, series `montflow-spec-standard`, with each
round's fixes applied by an isolated fixer under
`montflow-addressing-adversarial-review`. The series name is the spec name and
Phase A maps to round `001` (per `review-link` / `skills/executing-spec.ts`).

## Progress

- 2026-10-15: complete — review closed at round 004.

## Findings

- Series: `.agents/@montflow/reviews/montflow-spec-standard/` — rounds
  `001`–`004`; ledger `Status: closed`; `mf-reviews verify` →
  `✓ 5 review files verified.`
- Nine findings surfaced across the fix→re-review loops; eight fixed in code or
  spec text, one dismissed:
  - F1 (Major) — A004's `skills:` resolution reached only the `verify` gate;
    opened twice. The `verify` surfaces and the profiles interactive detail panel
    were fixed first, then the list surfaces (`pi-profiles`/`pi-prompts`
    `list --status valid`) were made to annotate `(N warnings)`. `valid`
    semantics unchanged (a warning never flips validity).
  - F2 (Minor) — `SKILLS_ENGINE_WARNING` became unreachable from `verifyAll`;
    a skipped skill check went silent. Fixed via a pure `skillsEngineWarning`
    that distinguishes "no store" (silent) from "no engine" (warn).
  - F3 (Major) — `SPEC.md` said Phase A/B modify no file outside
    `.agents/@montflow/specs/`, contradicting A003/A004. Requirement reworded to
    scope the constraint to the exploratory/planning tasks.
  - F4 (Minor) — profiles/prompts whole-store summary folded warnings into
    `issueCount`. Split into `N issues · M warnings`.
  - F5 (Nit) — new `pi-prompts/src/modules/skill-check/` untracked while a
    tracked file imports it. Won't Fix: staged by the Phase A commit.
  - F6 (Nit) — A099 completion pointed at `.../A.md`; repointed to
    `.../001/REVIEW.md`.
  - F7 (Minor) — per-entry failing verdict lines counted warnings as issues;
    now count errors only with a separate warning clause.
  - F8 (Nit) — dead `checkSkills` engine-unavailable branch and its
    `SkillCheck.warning` field removed.
  - F9 (Minor) — the interactive `Re-verify` notification (`notifyVerifyResult`)
    was a fifth verdict renderer missed by F7; same fix applied.
- Every finding has a terminal disposition (`Resolved` or `Won't Fix`); no
  `Open`/`Escalated` remain.

## Open Questions

- Out of scope for this review, noted only: the same `issues.length` rendering
  pattern survives in `packages/pi-skills/src/apps/interactive/interactive.apps.module.ts`
  (A003/A004 did not touch `pi-skills`).
- `mf-specs check` does not actually pass a review-series snapshot to
  `verifySpecTree`, so the `review-link` convention is not enforced by the CLI
  (pre-existing; relevant to C005/C007).

## Handoff

- Phase B (B001–B003 plan, B099 review) may proceed. B099 should write round
  `002` of this same series (`montflow-spec-standard`), not a new series.

## Deviations

- Accepted findings were fixed inline through the fix→re-review loop rather than
  spawned as separate `defect`/`execution` tasks; each has a recorded terminal
  disposition in the series.
- Phase lock (`locked-phases: A`) and task completion were written directly,
  not through a CLI verb — `mf-specs` still exposes no `lock`/`stamp`/`claim`
  verbs (montflow-spec-standard C005 is pending).
