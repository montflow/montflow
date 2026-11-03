# Changelog

## 0.0.2

### Patch Changes

- [#8](https://github.com/montflow/montflow/pull/8) [`f499e05`](https://github.com/montflow/montflow/commit/f499e05787abf1154d411836d68073c258ff8a49) Thanks [@DanielMontilla](https://github.com/DanielMontilla)! - First tracked release of the five `mf-*` CLIs. They are versioned and tagged
  together in one fixed group and are still never published to npm; the version
  exists so `mf-<cli> version` and the update check have something to compare.

Releases: this package is versioned and tagged by changesets but never published to npm; run the CLIs from a git checkout.

## Unreleased

### Added

- The v2 phase tree: `SPEC.md` with `spec-version: 2`, one directory per phase (`PHASE.md`, phase `MEMORY.md`, `BOARD.md`, optional `GATES.md`/`GATE-RESULTS.jsonl`), and one directory per task inside it
- Generator verbs for every verifier-checked field: `init`, `new-phase`, `new-task`, `stamp`, `claim`, `lock`, `waiver`, `tier`, `gate run`, `gate record`, and `mail`
- `claim` transitions the task status, the `SPEC.md` row, and the `PHASE.md` mirror in one transaction under a registry lock, with rollback
- Gate stages classified `mechanical` or `subjective`; `gate run` records the command and result, `gate record` records a reviewer verdict
- `review decide` computes `start`/`pass`/`fix-and-stop`/`rework`/`overflow`/`escalate`/`waived` from the review store, with `minor-deferred` closure and bounded overflow
- `/specs` parity for every generator, the `spec_tier` host tool, and a TUI picker that previews derived state and never offers a phase or task directory
- The three complexity tier instruction files (`micro`, `standard`, `full`) as a `tier` payload kind, installed by `mf-specs doctor` into `.agents/@montflow/tiers/`; they are the only place the artifact matrix and the interaction budget are stated
- A drift test that keeps the tier enum, the three files, the authoring skill's tier table, and the appraiser/split vocabulary aligned
- Initial tracked release of the `mf-specs` CLI.

### Changed

- **Breaking:** a flat task-directory tree is no longer accepted; `mf-specs migrate` moves every task under its phase and upgrades the tree
- **Breaking:** the stored lock list is gone; a phase lock is derived from completion, gate proof, and a closed review round or effective waiver, and `lock` only confirms it
- **Breaking:** no phase reserves a `*099` review task; a review task exists only for a non-waived phase
- `status`, `state`, `next`, and `list` read the phase records and show the derived lock, review decision, and gate proof
- `check` reads the review store and enforces the phase review budget, including authorized overflow and `minor-deferred` closure
- `migrate --all` upgrades in-progress specs and freezes complete specs unless `--include-complete` is passed; a version bump without the v2 tree is rejected
- `doctor` is manifest-driven (`payload.json`) and installs skills, prompts, and tiers; `--check` is report-only
- The shipped `spec-create`, `spec-execute`, and `spec-sizing` prompts speak the v2 vocabulary: phase directories, derived locks, no reserved review task, tier selection with `mf-specs tier`, the `## Creation` record, and the orchestrator-only `claim --start`/`--block`/`--close`/`--release`, `gate run`, and `mail`
- The `montflow-create-specs` skill gained the tier table and `init` as the tier-aware scaffold

### Fixed

- A v2 unfinished task whose `GATES.md` declares no classified stage now fails `check` with `gate.no-mechanical-stages`, and `claim --close` refuses with `claim.gate-unproven`; a complete or legacy record keeps its shape
- `create`/`init` emit a classified placeholder gate, so a fresh tree still checks clean while `gate run` refuses the placeholder until the author replaces it
