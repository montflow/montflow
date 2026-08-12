# Changelog

## [2.1.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter

## [2.0.0] - 2026-07-18

### Changed (breaking)

- **Removed in-place output mode.** Spec audits are now ALWAYS written to `.agents/@montflow/reviews/<name>/SPEC_<code>.md`. Aligns with `adversarial-review` v3.0.0; the file is the shared artifact the reviewer and `addressing-adversarial-review` coordinate through across fix→re-review loops.
- **Removed global `Fixer Notes` section.** Status and the `[Reviewer]`/`[Fixer]`/`[Human]` discussion now live per-finding under each finding's `### Discussion` thread.
- Per-finding format adopted from base skill: stable ID (`F1`, …), `Status`, `Attempts` (starts at 0, incremented only by the fixer), `First Seen`, append-only `### Discussion`, plus `## Summary` counts.
- Step 0 and Step 3 rewritten for file-only output; `<code>` reuse-on-re-audit rule aligned with base Step 9 (overwrite in place, bump `Iteration`, not the file code).
- Description now notes file output and pairs with `addressing-adversarial-review`.

### Added

- **Re-Audit** subsection (Step 3) — inherits base skill Step 9 mechanics with "spec files" substituted for "code"; verifies `In Review` findings against the spec artifacts themselves, never trusts `[Fixer]` turns as evidence.
- **Discussion Channel vs. Evidence** note inherited from base skill.
- GATES.md reorganized: Phase 0 tightened for re-audit + Discussion discipline; new Phase 3 (File Format) and Phase 4 (Re-Audit Discipline) gates; Phase 3 `SPEC_` prefix is now mandatory (no "in-place N/A" carve-out).

## [1.1.0] - 2026-07-18

### Fixed

- Isolation Requirement no longer restated verbatim — the base skill's requirement is inherited, with spec-specific additions only. Documented enforcement via independent subagent/session; non-isolated runs labeled in Review Metadata (adversarial-review M2, n4). GATES Phase 0 mirrors this.
- File-output isolation rule clarified: listing directory entries is permitted; only file *contents* are off-limits (M3).
- `REVIEW.md` dropped from the When-To-Use artifact list — the spec-audit pipeline does not audit `REVIEW.md` files, so listing it as a target artifact was misleading (m1).
- "Missing gates on execution" bullet no longer hardcodes four TS-specific gate names; generalized to the project's standard format/lint/typecheck/test gates with TS/Python/Go/Rust examples (m2).
- "Missing `GATES.md` is a Minor finding" rule stated once in a dedicated bullet and referenced from the other gate/test bullets, removing the duplicated clause (m3).
- "Interruptor false gate" finding now has an operational test: flag if assuming the default branch is taken, no later task fails and no requirement is violated — i.e. the gate has no teardown consequence if skipped (m4).
- GATES Phase 1 `file_path:line` requirement softened to allow citing an artifact/area for absence findings (m6).
- GATES Phase 1 trigger requirement adds a third category — "design observation" — for non-runtime findings (m7).
- GATES Phase 3 `SPEC_` prefix checkbox gated on file output mode (in-place output makes it N/A) (m8).
- File-output `<code>` counter wording unified with the base skill: "numeric portion of the filename" (n1).

## [1.0.0] - 2026-07-18

### Added

- Initial release of adversarial-review-feature-spec — extracted from adversarial-review v1.2.0
- Spec audit pipeline covering requirements, task coverage, gates, dependencies, types, phases, completion criteria, deviations, and scope/phasing
- Wraps adversarial-review as a base skill with spec-specific overrides
