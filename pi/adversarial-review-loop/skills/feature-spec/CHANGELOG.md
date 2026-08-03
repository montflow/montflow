# Changelog

## [3.4.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter

## [3.3.0] - 2026-07-18

### Added

- `Gates` column documented in FEATURE.md Frontmatter Reference (`Yes` if per-task GATES.md exists, else `No`) (adversarial-review m10)
- `locked-phases` instruction: "Leave empty at authoring; populated by executor on phase commits" (adversarial-review n12)

### Changed

- Review task requirement hardened from "**Highly recommended**" to "**MUST**" — every Phase must end with a `review` task, matching the GATES.md Phase 2 gate check (adversarial-review M1)
- Phase prefix formalized from `<LETTER>`/`<PHASE_LETTER>` to `<LETTERS>`/`<PHASE_LETTERS>` across all templates (TASK.md frontmatter, heading, REVIEW.md header, Scope block, SKILL.md naming format, dependency rule) supporting multi-letter prefixes (AA, AB…) beyond 26 phases (adversarial-review m11, m11-undone, m-v3-18)
- GATES.md dependency check broadened from inter-phase only to "same-phase or earlier-phase IDs only; no cycles" (adversarial-review m9)
- GATES.md task ID examples updated from 2-digit to 3-digit (`A001, A002, B001…`) (adversarial-review m3)
- `templates/REVIEW.md` now covers "accepted, deferred, or dismissed" in Human Review checklist (adversarial-review m4)
- `templates/REVIEW.md` header clarifies "problem (with trigger)" instead of standalone trigger field (adversarial-review m5)
- `templates/GATES.md` labels re-labeled from "Phase 0/1/2" to "Stage 0/1/2" to disambiguate from feature phases (adversarial-review n15)
- Collapsed self-referential CRITICAL note in Step 1 into a single instruction (adversarial-review n13)
- `workspace-type: worktree` now explicitly set for feature worktree case, not just detached HEAD (adversarial-review n14)
- Removed redundant "do not proceed" repetition in Step 1 field-collection instruction (adversarial-review n-v2-17)

### Fixed

- `templates/GATES.md`: `ts:check` made conditional (`if applicable`) for non-TypeScript projects (adversarial-review m6)
- Reference section now includes `REVIEW.md` in the MUST-READ template list (adversarial-review m7)
- Phase 1 gate now checks for `REVIEW.md` presence in review task directories (adversarial-review m8)

## [3.2.2] - 2026-07-14

### Fixed

- Task ID format changed from `<NN>` to `<NNN>` (3-digit zero-padded) to prevent overflow beyond 99 (M1)
- Added cross-phase dependency validation rule: `depends-on` must reference same or earlier phase only (M2)
- Removed all `(see ../../../REVIEW.md)` cross-references — replaced with self-contained inline explanations (M5)
- Added note about phase letter overflow beyond Z (26+ phases) (M7)
- Added `|| true` error guards to git commands in Step 0 bash block (N1)
- Added `locked-phases` field to FEATURE.md frontmatter reference table (N2)

## [3.2.1] - 2026-07-14

### Fixed

- Scoped `caveman-compression` to free-form prose; never compress frontmatter or MEMORY.md Handoff/Deviations/Requirements (REVIEW.md F3)
- `execution` tasks now recommend standard gates (`format:check`/`lint:check`/`ts:check`/`test`) when a GATES.md exists (REVIEW.md F4)
- Clarified `related-tasks` is an optional cross-reference; primary defect link is `originator: defect:<id>` (REVIEW.md F7)
- Documented the `feat/<name>` feature-branch convention and the `using-git-worktrees` `<branch>-worktree` fallback caveat (REVIEW.md F9)
- Clarified mandatory-field collection and `grilling` are the same one-question-at-a-time flow (REVIEW.md F10)
- Removed bare `defect` option from `templates/TASK.md` `originator` field (REVIEW.md F7)

## [3.2.0] - 2026-07-14

### Added

- Canonical status enum (`pending | in-progress | complete | blocked`) defined as the single source of truth for task status across feature-spec skills; `defect` is a task `type`, never a status

### Changed

- Status Enum note no longer references the deleted `managing-feature-spec-defects` skill

## [3.1.0] - 2026-07-14

### Added

- New `review` task type: runs an adversarial review of a completed phase, delegating to an independent subagent (not the main working agent) executing the `adversarial-review` skill
- `REVIEW.md` artifact template for `review` tasks — records severity-ranked findings (`file_path:line` + problem + impact + suggestion) and the human review / remediation-task handoff
- Phase-end review convention: every Phase should end with a `review` task that blocks phase completion until the human has reviewed `REVIEW.md` and a remediation task set (`defect` / `execution`) is authored for accepted findings
- `REVIEW.md` to the Frontmatter Reference and the file-generation step

## [3.0.1] - 2026-07-14

### Changed

- Updated `finding-vendors` dependency to `finding-references` in frontmatter and task type description

## [3.0.0] - 2026-07-11

### Changed

- Split into two skills: base `authoring-feature-spec` (non-worktree) and `authoring-feature-spec-in-worktree`
- Removed all workspace management (detection, worktree creation, init, relocate)
- Removed `using-git-worktrees` dependency
- Renumbered pipeline steps 0-5
- Updated description to clarify "current workspace" usage
- Clarified caveman-compression: applies to content, not template structure

### Added

- Step 0 "Redirect if in non-feature worktree": detects non-feature linked worktrees and redirects to worktree variant

## [1.3.1] - 2026-07-09

### Fixed

- Updated `grill-me` dependency and link references to `grilling` after skill rename

## [1.3.0] - 2026-07-08

### Added

- Prune `TASK.md` Completion checklist to include only items relevant to the assigned task `type`

## [1.2.0] - 2026-07-08

### Added

- Workspace type detection and `in-place` / `worktree` terminology
- Systematic missing-input handling with context-based recommendations
- `finding-references` dependency for exploratory tasks (formerly finding-vendors)
- All tasks own `MEMORY.md` for progress and handoff
- Gate concept documentation (any task type can have gates)
- `originator` field in TASK.md frontmatter
- Per-task `GATES.md` template (no frontmatter, validation checklists)
- Frontmatter Reference section documenting all file schemas

### Changed

- Pipeline: generate-files-first, then review (removed pre-generation approval gate)
- Design Gates section: not restricted to execution tasks
- Task types: removed `synthesizer`; `exploratory` references finding-references; `execution` gates optional

### Removed

- `FEATURE.md` concept (metadata absorbed into templates)
- `CHECKLIST.md` concept (validation moved to per-task GATES.md)
- Defect architecture and all defect references from authoring
- `synthesizer` task type

## [1.0.0] - 2026-07-07

### Added

- Initial release as `authoring-feature-spec` (renamed from `creating-feature-spec`)
- Git worktree integration in pipeline
- `grilling` for requirements gathering
- Phase-based execution model (Phase A, Phase B, Phase C)
- Task typing system via frontmatter
- Flat defect architecture
