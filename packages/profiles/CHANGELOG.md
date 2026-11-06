# Changelog

## 0.0.2

### Patch Changes

- [#8](https://github.com/montflow/montflow/pull/8) [`f499e05`](https://github.com/montflow/montflow/commit/f499e05787abf1154d411836d68073c258ff8a49) Thanks [@DanielMontilla](https://github.com/DanielMontilla)! - First tracked release of the five `mf-*` CLIs. They are versioned and tagged
  together in one fixed group and are still never published to npm; the version
  exists so `mf-<cli> version` and the update check have something to compare.
- Updated dependencies [[`f499e05`](https://github.com/montflow/montflow/commit/f499e05787abf1154d411836d68073c258ff8a49)]:
  - @montflow/skills@0.0.2

Releases: this package is versioned and tagged by changesets but never published to npm; run the CLIs from a git checkout.

## Unreleased

### Added

- The six spec-role profiles (`spec-appraiser`, `spec-bookkeeper`, `spec-creation-orchestrator`, `spec-execution-orchestrator`, `spec-sizing-orchestrator`, `spec-worker`) ship as installed `profile` payload and are repaired by `mf-profiles doctor`
- `mf-profiles doctor` reads `payload.json` and checks or repairs every declared profile; `doctor --check` is report-only and `mf-profiles:check` ends with it
- Initial tracked release of the `mf-profiles` CLI.

### Changed

- The official gate has one owner: the worker runs scoped checks and records them, and the orchestrator runs `mf-specs gate run` once per task at completion and the repo-wide gate once per phase boundary; any `GATES.md` stage is the orchestrator's to execute
- The orchestrator starts a phase review with the `review_create` tool in the host, or `mf-reviews create <name> [--round <NNN>]` to scaffold outside it, and `mf-reviews resume <name>` picks it back up; the nonexistent `mf-reviews start` is gone
- Steering reaches a worker through the dispatch and its receipt; the worker also reads the phase `BOARD.md` and its own `MAILBOX.md` at start and again before the receipt, while `mail` remains orchestrator-only
- The execution orchestrator dispatches the full ready set in one concurrent pass, bounded by `depends-on` and the workspace in-flight limit, and runs phase-shared verification once through the scheduler instead of once per worker
- The appraiser and creation orchestrator name each phase's independent tasks and shared checks, so a serial phase is stated with a reason instead of being the default
- **Breaking:** a spec-role profile in the store is manifest-owned payload; a local edit is `stale` and repair overwrites it. An unlisted profile in the same store is user data and is never deleted
- Every shipped profile speaks the v2 vocabulary: tier loading, phase directories, derived locks, `claim` status transitions, `gate run`, `mail`, and no hand-written state
- The execution orchestrator calls `mf-specs review decide` after every round and names the `minor-deferred` closure and authorized overflow; it no longer counts rounds or severities
- The execution orchestrator names the orchestrator-only verbs; the worker and bookkeeper name only the verbs they may call
- The worker and execution-orchestrator profiles carry the lean execution contract: the worker reads only the phase `## Execution Brief` plus its `TASK.md`/`GATES.md` and scoped source (never a broad grep over generated payloads or lockfiles), keeps its `MEMORY.md` at or under 80 lines with full logs in `/tmp`, and the official gate runs once per task while the repo-wide gate runs once per phase boundary
- Review rework is one batched fixer attempt and one re-review per round, keyed off `mf-specs review decide`; one-fixer-per-finding dispatch is gone
- Both profiles and the `spec-execute` prompt state **step economy**: batch independent reads and writes in one turn, write whole files instead of chains of small edits, verify once at the end, never re-read what was just written; the repo-wide gate runs only at the phase boundary and never for a task `## Completion` item

### Fixed

- A `skills:` reference resolves only to a store directory containing `SKILL.md`, so an empty directory no longer counts as an installed skill
- `/mf-profiles-cli verify --strict` parses the flag instead of treating it as a profile name, and the flag reaches `verifyAll`
