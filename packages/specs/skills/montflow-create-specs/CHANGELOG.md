# Changelog

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
