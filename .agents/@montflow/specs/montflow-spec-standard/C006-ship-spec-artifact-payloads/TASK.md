---
id: C006
name: ship-spec-artifact-payloads
type: execution
originator: planner:B003
depends-on: A004, C004, C005
related-tasks:
status: pending
---

# Task C006: ship spec artifact payloads

## Type: execution

## Description

Turn the seven artifacts authored by hand during design into installed package payload,
promote the injected execution template literal into a real verifiable skill, and
align everything to the v2 vocabulary the earlier tasks created.

## Requirements

- The five spec-role profiles and two pipeline prompts move into a package payload directory and install through `doctor`, so a fresh clone obtains them and nothing is hand-copied.
- The injected execution template literal becomes a real workspace skill with a verifier-covered shape, and the authoring skill is rewritten for v2: phase directories, derived locks, no reserved review task, tier selection.
- Tier instruction files ship as payload and are the only place a tier artifact matrix and interaction budget appears; the B001 drift test keeps enum, files, and skill text aligned.
- Profiles and prompts are updated to the verbs that now exist, so the earlier stop-and-report-the-gap fallback becomes a live path, and every reference resolves under the A004 checker.
- `model` stays unset in every shipped artifact unless a model is chosen explicitly here, and the split verdict and tier wording match B001 verbatim.

## Completion

- [ ] A clean workspace gains all artifacts via the repair command, and report-only mode then stays silent with zero issues
- [ ] Every `skills:` reference in every profile and prompt resolves; the checker reports none missing
- [ ] Authoring and execution skills reference only verbs that exist, verified by grepping each command named
- [ ] `bun run verify:montflow:extensions` passes and changelog entries exist where behavior changed
