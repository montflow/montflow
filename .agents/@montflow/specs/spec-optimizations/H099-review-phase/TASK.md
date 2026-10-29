---
id: H099
name: review-phase
type: review
originator: user
size: small
depends-on: H001, H002
related-tasks:
reviewer-profiles:
status: complete
---

# Task H099: review-phase

## Type: review

## Description

Run an independent adversarial review over phase H: the repo-agnostic reviewer
selection rule and the advisory profile-existence check. The phase changes
package prose, test fixtures, and one warning-severity verifier path, so it
declares no reviewer profile — the general reviewer is the whole review.

## Requirements

- Findings are written to the general review series `spec-optimizations` with
  `- Phase: H` in the round metadata; no profile series is opened or expected.
- Attack the rule for portability: a repo with no `.agents/@montflow/profiles`,
  or with only profiles this repo never names, must be able to follow the
  prompt and the skill without meeting an undefined slug. Nothing in
  `packages/specs` may imply a profile for a task type.
- Attack the cost claim: an empty `reviewer-profiles` is valid on a phase holding
  `execution` tasks, and a declared profile adds exactly one round per cycle
  against an unchanged budget.
- Attack the warning path: missing profiles root, present profile, absent
  profile, several slugs on one task, `PROFILE.md` missing inside an existing
  slug directory, and `--strict` promotion. Confirm exit codes.
- Confirm `mf-specs doctor` keeps the packaged and workspace skills byte
  identical and that no `.agents/@montflow/prompts/` or `.agents/skills/` file was
  hand-edited.
- Resolve or escalate every finding with a reason.

## Completion

- [ ] Findings are resolved or escalated
- [ ] The round is linked with `- Phase: H` in `spec-optimizations`
- [ ] No concrete reviewer profile name remains in `packages/specs`
- [ ] `bun run mf:gate` passes
