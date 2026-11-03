# Changelog

## [2.13.1] - 2026-11-03

### Changed

- The layout section documents the v2 phase directory (`PHASE.md`, `MEMORY.md`, `BOARD.md`, optional `GATES.md`/`GATE-RESULTS.jsonl`) and the task files (`TASK.md`, `MEMORY.md`, optional `GATES.md`/`MAILBOX.md`/`GATE-RESULTS.jsonl`); a phase is no longer described as a pure task container
- The phase rules name `mf-specs lock` as the confirmation verb that stores nothing

## [2.13.0] - 2026-11-03

### Added

- The complexity tier contract: `micro`, `standard`, and `full` with the phase range, exploration rule, work-task ceiling, review default, waiver policy, and question budget; `mf-specs tier <tier>` loads exactly one shipped tier file
- Tier-aware authoring with `mf-specs init --tier`, the `## Creation` record (`tier`, self-reported `questions <n>/<budget>`, unresolved decisions), and `mf-specs waiver` for the phase review decision

### Changed

- The scaffold step prefers `init`; `create` remains the tier-agnostic scaffold, and no phase has a reserved review task
- The split verdict is the exact `verdict`/`cut`/`count`/`specs`/`slug`/`tier`/`scope`/`evidence` shape

## [2.12.0] - 2026-11-03

### Changed

- `mf-specs create` no longer appends a reserved `<PHASE>099` review task; a review task is emitted only when `--tasks` requests `name:review`, and `--reviewer-profiles` applies to the requested review task

## [2.11.0] - 2026-11-02

### Changed

- `task.completion-unchecked` and `gate.unchecked` are errors on a `complete` task, not warnings; an unfinished task may still carry an unchecked checklist or an all-unchecked gate with no finding
- The phase directory is the container for every task, and no phase requires a reserved review task; a lock is derived from a closed review round

### Added

- `size: none` as the completed-record opt-out: it is accepted only on a `complete` task, is never a dispatch target, and contributes no review budget

## [2.10.0] - 2026-10-28

### Added

- A gate names the task's own verification commands: `mf-specs create` writes a `REPLACE` marker item that the author and the review replace, never a copied repo-wide suite
- The record checks and the mechanical review budget: `task.completion-unchecked`, `gate.unchecked`, and a `review.budget-exceeded` error when a series holds more rounds for a phase than that phase's task sizes buy

## [2.9.1] - 2026-10-28

### Changed

- Catalogue reads name their host-free form: `spec_models` in the host, `mf-specs models --catalog <path>` outside it, because a bare `mf-specs models` fails `models.unavailable` there
- The sizing output distinction is explicit: compact `sizing` omits the budget, `--human` / `--verbose` prints it, and `models --verify` states the entries checked and skipped

## [2.9.0] - 2026-10-28

### Added

- The prerequisite skill list and the two-tier behavior: doctor installs the required `montflow-create-specs` and `montflow-find-specs` skills, while a missing non-owned skill (`executing-skills`, `grilling`, `i-have-adhd`, or a review skill) is advisory and leaves a `prompt.skill-advisory` block in the rendered prompt

## [2.8.0] - 2026-10-28

### Added

- Open-versus-fixed scope: omitting `--scope` leaves the layer open and the wizard asks; `--name` implies the spec layer, `--name --phase` implies that phase, and an explicit `--scope` wins and refuses flags it cannot honour
- The proof loop for a generated config: `models --verify` for the touched scope, then `check`, then `sizing --task <id> --human` for one task per explicit target

## [2.7.0] - 2026-10-26

### Added

- The authoring-versus-generation boundary: a task's size is chosen while authoring, but a spec's `sizing.json` is generated afterwards by the `spec-sizing` prompt (`mf-specs sizing-config` / `/specs sizing-config` / `spec_sizing`), run by the `spec-sizing-orchestrator` role
- The catalogue rule: never type a model id or an effort into a config by hand; `mf-specs models` is the only authority, and `variants unknown` or `variants none` forbids an effort

### Changed

- The reference names `spec-sizing` beside `spec-create` and adds `mf-specs models` / `models --verify`

## [2.6.0] - 2026-10-26

### Added

- Front-end section pointing at the shipped `spec-create` prompt, `mf-specs author --request` / `/specs author` / `spec_author`, and the doctor gate

### Changed

- The reference names `packages/specs/prompts/spec-create.json` and drops the deleted `src/skills/authoring-spec.ts` contract source

## [2.5.0] - 2026-10-26

### Changed

- Renamed from `montflow-create-pi-specs` to `montflow-create-specs`; the retired Pi infix is gone from the directory, the frontmatter `name`, and every cross-reference

## [2.4.0] - 2026-10-26

### Added

- Task `size` in `TASK.md` frontmatter: `tiny`, `small`, `medium`, or `large`, chosen per task by risk
- The review-cycle budget each size buys (`tiny` 1, `small` 2, `medium` 3, `large` 3), the hard cap of 3, and the rule that a phase's budget is its largest non-review task's
- Layered `sizing.json` config (repo → spec → phase), the whole-entry merge rule, and the `inherit` fallback when no layer defines a size
- `size` as the fourth `--tasks` token, `name[:type[:gates[:size]]]`, defaulting to `medium`
- `mf-specs sizing --task --human` / `mf-specs resolve --task` as the way to read a dispatch target and its provenance

## [2.3.0] - 2026-10-25

### Changed

- The slash-command form is `/specs create` in the OpenCode host; `mf-specs create` is the binary

## [2.2.0] - 2026-10-15

### Added

- `reviewer-profiles` on the `review` task: the field, its `<spec>-<profile>` series, and the `effect-reviewer` binding for code phases (any phase holding an `execution` or `defect` task)
- `--reviewer-profiles` in the scaffold command and reference

## [2.1.0] - 2026-10-13

### Added

- `mf-specs create` scaffold step: the skill now scaffolds a valid tree with the deterministic, model-free CLI before filling it in

### Changed

- Self-check now runs `mf-specs check --name <spec>`

## [2.0.0] - 2026-10-06

### Changed

- The skill now authors the spec directly (`SPEC.md` plus one directory per task) from its own rules
- Dropped the `mf-specs create` dispatch pipeline, the model and effort inputs, and the session-id handoff

## [1.0.0] - 2026-10-06

### Added

- Initial release of montflow-create-pi-specs
- Collecting the three dispatch inputs (prompt, model, effort) and reporting the session id
- `mf-specs doctor` install path into `.agents/skills/`
