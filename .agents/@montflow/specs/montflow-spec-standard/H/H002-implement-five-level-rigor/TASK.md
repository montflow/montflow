---
id: H002
name: implement-five-level-rigor
type: execution
originator: user
size: tiny
depends-on: H001, C006
related-tasks: H003
status: complete
write-scope: packages/specs, packages/profiles/profiles/spec-appraiser
---

# Task H002: implement the five-level rigor ladder

## Type: execution

## Description

Land the H001 ladder as code and payload: one enum and contract, five tier
files, the `mf-specs tier` read path, and the drift test that keeps the enum,
the files, the skill table, and the prompt in sync. This task consumes C006's
three-tier mechanism and supersedes its three values; it does not re-implement
the payload manifest or the doctor.

## Requirements

- Replace the three-value enum with the H001 five values in
  `packages/specs/src/modules/tier/`; keep `TIERS`, `isTier`, `SPLIT`,
  `SPLIT_FIELDS`, and the no-default rule. A missing or unknown value still
  fails `tier.unknown`; `split` is still a verdict, never a tier.
- Write one tier file per value under `packages/specs/rigors/`, with frontmatter
  matching the contract field-by-field and prose that states the selection
  test, phase plan, exploration rule, gate expectation, review default, waiver
  policy, artifact rules, and the exact question budget sentence.
- Extend `mf-specs rigor <value>` to the five values and keep the
  `tier.missing`/`tier.stale` diagnostics, the payload manifest entries, and
  the installed copies under `.agents/@montflow/tiers/` correct.
- Update the drift test to cover five values and every leg H001 names: enum ↔
  file set, enum ↔ frontmatter contract, enum ↔ prose budget sentence, enum ↔
  authoring-skill table, enum ↔ prompt/appraiser tokens, and the
  non-restatement greps. A missing or extra tier file fails by name.
- Update the authoring skill's tier table and the `spec-appraiser` profile to
  the five values, and keep the split verdict shape unchanged. Do not edit the
  completed B003 record; its decision is superseded by H001.
- If C006 landed the three names, map or rename them in one migration-shaped
  change: no installed prompt, doctor check, or spec gains a finding, and the
  old names are not accepted as aliases unless H001 says they are.
- Tests cover every enum value, the unknown value, the split value, each drift
  leg, the payload manifest entries, and the installed/packaged byte equality.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [x] Five values exist in code and in `packages/specs/rigors/`, with no extra file and no missing one
- [x] `mf-specs rigor <value>` prints exactly the chosen file for all five and rejects the others
- [x] The drift test fails by name when a file, frontmatter field, prose budget, or skill row is missing
- [x] No rigor file names a size, model, effort, or review-cycle count
- [x] Every existing spec and installed prompt still checks clean
