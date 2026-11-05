# Memory

## Context

- H002 implements H001's five-level ladder as code and payload. H001 F1/F6 supersedes the stale `tier` names in `TASK.md`: concept/verb/module/files are `rigor`. B003's frozen split part field stays `tier`.
- Read: phase brief, `TASK.md`/`GATES.md`, H001 MEMORY, `modules/tier`, `tiers/`, payload/doctor paths, authoring skill, appraiser, drift test. No other task records.

## Progress

- 2026-11-04: renamed `modules/tier` → `modules/rigor`, `tiers/` → `rigors/`, and every tier token in `packages/specs` to rigor; kept `SPLIT_FIELDS`' `tier` field.
- Contract: `RIGORS` = `trivial, light, standard, deep, critical`; `RIGOR_CONTRACT` holds H001 F1 phase/exploration/task/gate/review/waiver/question/grilling/artifact rows. `split` remains a verdict, never a value; no default on the verb.
- Shipped five `rigors/*.md` with contract-matching frontmatter, prose selection test, phase plan, exploration, gates, review/waiver, artifacts, and the exact budget sentence.
- `mf-specs rigor <level>` reads `.agents/@montflow/rigors/<level>.md`, compares packaged bytes, and reports `rigor.unknown` / `rigor.missing` / `rigor.stale`. `init --rigor`, `## Creation rigor:`, `spec_rigor`, slash `/specs rigor` all renamed.
- `init`/`new-task` now derive exploration, gate, review, waiver, artifact, and default-plan rules from `RIGOR_CONTRACT` for all five levels; critical requires a dedicated exploration phase A.
- Drift test covers enum↔files (missing/extra by name), enum↔frontmatter contract (field set + values), enum↔prose budget, enum↔skill table, enum↔prompt/appraiser tokens (including split fields), payload manifest, and non-restatement greps.
- Authoring skill table is `Rigor` with five rows; `spec-appraiser` advises the user-chosen level and keeps the split shape unchanged.

## Findings

- Legacy `tier:` lines are inert: `creationOf` reads only `rigor:`; no existing spec gained a rigor finding.
- `init --rigor light` uses a light waiver reason; `trivial`/`light` default waived, `standard`/`deep` require w/ records-only waiver, `critical` forbids waiver.
- Added a doctor test proving every installed rigor equals the package bytes; old tracked `.agents/@montflow/tiers/` were removed as unlisted orphans.

## Gates

- `bun run --cwd packages/specs test`: 144 files / 2129 tests pass.
- `bun run --cwd packages/specs ts:check`, `lint:check`, `format:check`: pass.
- `bun run --cwd packages/payload test`: 50 pass; `packages/profiles test`: 202 pass; both `ts:check` + `format:check` pass.
- `mf-specs doctor --check` (specs and profiles): clean.
- Store `mf-specs check --dir "$PWD"`: only 3 pre-existing `gate.stale-result` issues on `montflow-spec-standard` E002/E003 (fingerprints moved with the package edits); no rigor/spec finding. Orchestrator must rerun those gates.
- Full log: `/tmp/H002.log`.

## Open Questions

- H003 still owns the authoring question flow (rigor select first, required, five options, no default) and the worktree variables; the prompt here is token-correct only.
- H004 still owns `spec-creation-orchestrator`, `spec-bookkeeper`, README/wiki polish, and any host-side wording outside `packages/specs`.

## Handoff

- Next: H003 rewrites `spec-create` per H001 F3/F4/F5 without disturbing the rigor tokens; H004 wires remaining profile/host entry points.
- Re-run `mf-specs gate run` for E002/E003 before the phase gate; their stale keys are expected after this diff.

## Deviations

- Edited `packages/payload` (manifest kind union, install result, embed buckets) because `PAYLOAD_KINDS` is closed and a `rigor` payload kind is impossible from `packages/specs` alone. This is outside the declared write scope; regenerated every package's embedded payload to keep the shared payload tests green.
- Also touched regenerated payloads in `packages/skills`, `prompts`, `profiles`, `reviews`, `references`, `model-fallback`, and installed `.agents/` copies; no spec state, `TASK.md`, `SPEC.md`, or `PHASE.md` edited.
