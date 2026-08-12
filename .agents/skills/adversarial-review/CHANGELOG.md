# Changelog

## [3.1.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter

## [3.0.0] - 2026-07-18

### Changed (breaking)

- **Removed in-place output mode.** Reviews are now ALWAYS written to `.agents/@montflow/reviews/<name>/<code>.md`. The file is the shared artifact enabling fixer↔reviewer coordination across fix→re-review loops (pairs with the new `addressing-adversarial-review` skill). Step 0 simplified accordingly.
- **Removed global `Fixer Notes` section.** Status and coordination now live per-finding (`Status`, `Attempts`, `### Discussion`).
- Per-finding format extended: stable ID (`F1`, `F2`, …), `Status`, `Attempts` (starts at 0, incremented only by the fixer), `First Seen` iteration, and an append-only `### Discussion` thread tagged `[Reviewer]` / `[Fixer]`.
- Added status lifecycle table (`Open` → `In Review` → `Resolved` / `Won't Fix` / `Escalated`) describing which role writes each transition.

### Added

- **Step 9 (Re-Review)**: scoping rules for iterating an existing review file in place — verify `In Review` findings against the code, never re-review `Escalated` findings without human input, hunt for new regressions, bump iteration, append-only Discussion, reviewer never touches `Attempts`.
- **Discussion Channel vs. Evidence**: notes that `[Fixer]` entries are unverified assertions and that the isolation principle still holds — the reviewer verifies by reading code, not by trusting the fixer's narrative.
- GATES.md reorganized: Phase 0 isolation tightened for re-review + Discussion discipline; new Phase 3 (File Format) and Phase 4 (Re-Review Discipline) gates.

## [2.1.0] - 2026-07-18

### Fixed

- Removed `adversarial-review-feature-spec` from `dependencies:` (adversarial-review C1) — the dependency direction is one-way (spec skill depends on base), resolving the circular dependency that broke deterministic topological loading.
- Step 1 "Map the Change" no longer demands author-only "why"; reworded to derive intent from allowed inputs (spec/goals/public docs) (M1).
- Isolation Requirement now structurally enforced via independent subagent/session; non-isolated runs explicitly labeled in Review Metadata (M2). GATES Phase 0 mirrors this.
- File-output isolation rule clarified: listing directory entries is permitted; only file *contents* are off-limits (M3).
- Step 2 bug-hunt checklist gaps closed: float equality without epsilon, memory ordering/visibility across threads, log injection / CRLF in log input (Step 3), Unicode normalization (NFC/NFD) and BOM handling (Step 4), signed underflow → UB distinguished from unsigned wraparound (m9).
- Step 8 "Report" now handles the no-findings case: state `No defects found.` and list coverage areas re-checked (m10).
- GATES Phase 1 `file_path:line` requirement softened to allow citing an artifact/area for absence findings (m6).
- GATES Phase 1 trigger requirement now has a third category — "design observation" — for non-runtime findings like over-engineering, naming, API ergonomics (m7).

### Changed

- File-output `<code>` counter wording unified with the spec skill: "numeric portion of the filename" instead of "numeric prefix/suffix" (n1).

## [2.0.0] - 2026-07-18

### Changed

- Split feature-spec auditing out into `adversarial-review-feature-spec` skill (major). Core skill now focuses on code/PR/diff review only. Steps renumbered (old Steps 3→8 shifted down by 1 to new Steps 2→7).
- Removed Step 2 (Adversarial Spec Audit) — moved to the new dependent skill.
- Simplified Step 0 (Output Mode): removed Feature-Spec Task mode.
- Simplified Step 8 (Report): removed feature-spec adaptation section.
- Updated GATES.md: removed Phase 1 spec-audit gate check.

## [1.2.0] - 2026-07-18

### Added

- Optional file output: when the user explicitly requests, the review is saved to `.agents/@montflow/reviews/<name>/<code>.md` with sequential numeric codes and zero-padded numbering; reviewer must not read existing reviews in that directory to maintain isolation (adversarial-review M3)
- Step 0 (Determine Output Mode): agent must self-check before reviewing whether output is in-place, `.agents/@montflow/reviews/`, or feature-spec `REVIEW.md` (adversarial-review M4). *(The feature-spec `REVIEW.md` output mode was removed in 2.0.0 — see the 2.0.0 changelog entry.)*
- Standard file structure for review files across both output modes, with **Findings** and **Fixer Notes** sections; feature-spec adaptation omits **Review Metadata** since the spec provides context (adversarial-review M4)

## [1.1.1] - 2026-07-18

### Fixed

- Defect task type-misuse check now inspects `originator: defect:<id>` (aligns with authoring-feature-spec v3.2.1+) instead of `related-tasks` (adversarial-review M2)
- Feature-spec artifact list in spec-audit preamble includes `REVIEW.md per review task` (adversarial-review M-v2-16)

## [1.1.0] - 2026-07-15

### Added

- Isolation requirement: the reviewer must operate in a brand new context with no knowledge of the original implementer's thoughts or rationale; Phase 0 gate added to GATES.md

## [1.0.1] - 2026-07-14

### Fixed

- Relaxed spec-audit: a missing GATES.md is only a Minor finding for code-modifying tasks with no other validation; standard checks required only when a GATES.md exists (REVIEW.md F4)

## [1.0.0] - 2026-07-14

### Added

- Initial release of adversarial-review
- Hostile, bug-hunting code review pipeline covering correctness, security, edge cases, design, test coverage, and documentation gaps
