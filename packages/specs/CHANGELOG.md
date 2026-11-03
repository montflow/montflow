# Changelog

## 0.0.2

### Patch Changes

- [#8](https://github.com/montflow/montflow/pull/8) [`f499e05`](https://github.com/montflow/montflow/commit/f499e05787abf1154d411836d68073c258ff8a49) Thanks [@DanielMontilla](https://github.com/DanielMontilla)! - First tracked release of the five `mf-*` CLIs. They are versioned and tagged
  together in one fixed group and are still never published to npm; the version
  exists so `mf-<cli> version` and the update check have something to compare.

Releases: this package is versioned and tagged by changesets but never published to npm; run the CLIs from a git checkout.

## Unreleased

### Added

- `init` and `create` scaffold a phase `MEMORY.md` with a five-bullet `## Execution Brief` skeleton (Read, Write scope, Gate, Record, Review), and a scaffolded task `MEMORY.md` carries the full fixed section set, so a fresh tree is clean
- The v2 phase tree: `SPEC.md` with `spec-version: 2`, one directory per phase (`PHASE.md`, phase `MEMORY.md`, `BOARD.md`, optional `GATES.md`/`GATE-RESULTS.jsonl`), and one directory per task inside it
- Generator verbs for every verifier-checked field: `init`, `new-phase`, `new-task`, `stamp`, `claim`, `lock`, `waiver`, `tier`, `gate run`, `gate record`, and `mail`
- `claim` transitions the task status, the `SPEC.md` row, and the `PHASE.md` mirror in one transaction under a registry lock, with rollback
- Gate stages classified `mechanical` or `subjective`; `gate run` records the command and result, `gate record` records a reviewer verdict
- `review decide` computes `start`/`pass`/`fix-and-stop`/`rework`/`overflow`/`escalate`/`waived` from the review store, with `minor-deferred` closure and bounded overflow
- `/specs` parity for every generator, the `spec_tier` host tool, and a TUI picker that previews derived state and never offers a phase or task directory
- The three complexity tier instruction files (`micro`, `standard`, `full`) as a `tier` payload kind, installed by `mf-specs doctor` into `.agents/@montflow/tiers/`; they are the only place the artifact matrix and the interaction budget are stated
- A drift test that keeps the tier enum, the three files, the authoring skill's tier table, and the appraiser/split vocabulary aligned
- Initial tracked release of the `mf-specs` CLI.
- Profile discovery in authoring: the `spec-create` prompt and the `montflow-create-specs` skill name `mf-profiles list` as the step before choosing `reviewer-profiles`, with `mf-profiles show <name>` for the instructions and review checklist when a description does not settle the choice; an empty `reviewer-profiles` list stays the default, and a small fully gated phase may end at its gates
- The lean execution contract: `check` reports `phase.execution-brief-missing` as a warning for a v2 `in-progress` phase whose `MEMORY.md` lacks `## Execution Brief`, and a drift test fails when a lean marker disappears from the worker/orchestrator profiles, the `spec-execute` prompt, or the authoring skill, or when an installed copy diverges
- The parallel authoring contract: the `montflow-create-specs` skill and `spec-create` prompt author the widest ready set, declare each task's `write-scope:`, use `depends-on` only for a real dependency, split colliding phases, and state a serial phase with `serial-reason:`
- The two gate layers: a task `GATES.md` carries task-local commands while phase-shared and repo-wide checks are named once in the phase gate; the execution prompt, orchestrator, and worker dispatch the full ready set, read the board and mailbox, and run shared verification once through the scheduler
- A generated task `MEMORY.md` (from `init` or `create`) carries the seven fixed sections — Context, Progress, Findings, Gates, Open Questions, Handoff, Deviations — and never `## Execution Brief`, which only a phase memory carries
- The `montflow-create-specs` skill writes the phase `## Execution Brief` (context packet, read budget, write scope, official gate command, record cap) for every new phase, points each pending task at it with `## Execution`, and forbids restating a command already named in the task's `GATES.md`

### Changed

- The `spec-execute` prompt is the loop, not a second copy of the contract: it keeps the truth reads, the dispatch rules (at most 2 workers in flight), one gate owner, one fixer attempt plus one re-review, and the close order, and points at the profile, the tier files, and `packages/specs/README.md` for the verb set and the review-policy branches; it names the in-repo `bun run --cwd packages/specs cli … --dir "$PWD"` form when `mf-specs` is not on `PATH`, runs the repo-wide gate between the closed round and `lock`, resolves a re-review that still leaves Minor findings through `fix-and-stop`, and names the spec-completion gate and `Spec:` trailer
- `phase.execution-brief-missing` fires when the `## Execution Brief` section is absent _or_ does not name Read, Write scope, Gate, Record, and Review, and `mf-specs lock` refuses a started v2 phase without a valid brief (complete and frozen phases stay exempt)
- The lean drift test asserts each rule's direction and mutates every marker, so an inverted contract fails instead of staying green; the worker and orchestrator read the phase `BOARD.md` and each task `MAILBOX.md` at start and before a receipt, the execution prompt dispatches the full ready set, and the authoring skill makes `GATES.md` the sole owner of executable commands
- **Breaking:** a flat task-directory tree is no longer accepted; `mf-specs migrate` moves every task under its phase and upgrades the tree
- **Breaking:** the stored lock list is gone; a phase lock is derived from completion, gate proof, and a closed review round or effective waiver, and `lock` only confirms it
- **Breaking:** no phase reserves a `*099` review task; a review task exists only for a non-waived phase
- `status`, `state`, `next`, and `list` read the phase records and show the derived lock, review decision, and gate proof
- `check` reads the review store and enforces the phase review budget, including authorized overflow and `minor-deferred` closure
- `migrate --all` upgrades in-progress specs and freezes complete specs unless `--include-complete` is passed; a version bump without the v2 tree is rejected
- `doctor` is manifest-driven (`payload.json`) and installs skills, prompts, and tiers; `--check` is report-only
- The shipped `spec-create`, `spec-execute`, and `spec-sizing` prompts speak the v2 vocabulary: phase directories, derived locks, no reserved review task, tier selection with `mf-specs tier`, the `## Creation` record, and the orchestrator-only `claim --start`/`--block`/`--close`/`--release`, `gate run`, and `mail`
- The `montflow-create-specs` skill gained the tier table and `init` as the tier-aware scaffold
- The `spec-execute` prompt carries the lean execution contract: the worker reads only the phase `## Execution Brief`, its `TASK.md`/`GATES.md`, and the scoped source, never broad-greps generated payloads or lockfiles, keeps its `MEMORY.md` at or under 80 lines with logs in `/tmp`, runs the official gate once per task, and gets one batched fixer attempt and one re-review per round after `mf-specs review decide`
- The `spec-execute` prompt states step economy and the gate boundary: a dispatch tells the worker to batch independent reads and writes in one turn, write whole files, and verify once at the end, and the repo-wide gate runs once per phase after the review pass instead of whenever a task checklist names it
- The `montflow-create-specs` skill plans in waves (independent tasks per wave plus the critical path) and keeps repo-wide suites out of `## Completion` items, so a task checklist can never force a second heavyweight run mid-phase

### Fixed

- A v2 unfinished task whose `GATES.md` declares no classified stage now fails `check` with `gate.no-mechanical-stages`, and `claim --close` refuses with `claim.gate-unproven`; a complete or legacy record keeps its shape
- `create`/`init` emit a classified placeholder gate, so a fresh tree still checks clean while `gate run` refuses the placeholder until the author replaces it
