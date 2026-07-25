# Changelog

## [1.5.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter

## [1.4.0] - 2026-07-22

### Added

- New "Orchestrator Role" section: scheduling, spawning subagents, generating tasks from reviewer feedback, supervising loop limits, per-phase operation
- New "Subagent Spawning" section: generic low/high capacity tiers for sub-agent model selection (no hardcoded model names)
- New "Verification Commands" directive: subagents consult the project manifest (e.g. `package.json`) to discover verification commands instead of assuming a fixed toolchain
- Added `caveman-reasoning` to dependencies; orchestrator and all subagents apply it to their reasoning trace
- Review-loop cap of 5 iterations: per-phase counter in MEMORY.md; halts execution and reports unresolved findings when reached
- Mermaid diagram: added review-loop cap decision node (`CAP` → `HALT2`)

### Changed

- Review loop in Step 4 now references the cap explicitly in the flow header

## [1.3.2] - 2026-07-14

### Fixed

- Mermaid `END` node renamed to `DONE` to avoid keyword conflict (n4)
- Remediation task loop now re-runs adversarial review (M → RX) instead of skipping it (C1, M3)
- Step 4 prose: reset review task to `pending` after remediation, re-run review, mark complete only at end-of-phase prompt (C1, M3)
- Task ID generation changed from 2-digit `<NN>` to 3-digit `<NNN>` zero-padded (A001–A999) to prevent overflow (M1)
- Defect-child scanning uses `originator` only; `related-tasks` is optional cross-reference, not used for blocking (M4)
- Added spec validation sub-step: checks FEATURE.md, TASK.md frontmatter, canonical status enum, `locked-phases` parseability (M5)
- Invalid status values coerced to `blocked` with deviation logged in MEMORY.md (m1)
- Removed dead `../../../REVIEW.md` references; replaced with inline explanations (m5)
- Updated GATES.md: added validation gates, independent-subagent review gate, review-task lifecycle gate (C1, M3, M5)

## [1.3.1] - 2026-07-14

### Fixed

- `interruptor` tasks now halt the phase as a hard stop instead of running in parallel (REVIEW.md F1)
- `planning` tasks now wait for in-phase `depends-on` tasks to reach `complete` before spawning (REVIEW.md F2)
- Scoped `caveman-compression` to free-form prose only; never compress frontmatter or MEMORY.md Handoff/Deviations/Requirements (REVIEW.md F3)
- Added `finding-references` to `dependencies` frontmatter (REVIEW.md F5)
- Executor now marks a parent `blocked` while its `type: defect` children are open (REVIEW.md F6)
- Clarified GATES.md wording in Load State step (REVIEW.md F11)
- Corrected stale 1.1.0 entry claiming defects come only from user feedback (REVIEW.md F8)

## [1.3.0] - 2026-07-14

### Added

- `review` task type: executed by an independent subagent running the `adversarial-review` skill over the completed phase, writing findings to `REVIEW.md`
- Independent-subagent review step in the mermaid pipeline (review task runs after non-review tasks, before phase lock)
- End-of-Phase Review flow: human reviews `REVIEW.md`, accepted findings become `defect`/`execution` remediation tasks, then loop
- `review` added to the task-type behavior table and frontmatter description

## [1.2.2] - 2026-07-14

### Changed

- Updated `finding-vendors` reference to `finding-references` in exploratory task description

## [1.2.1] - 2026-07-09

### Added

- Added `executing-skills` as required dependency in frontmatter
- Added prerequisite alert after "When To Use" referencing executing-skills

## [1.2.0] - 2026-07-08

### Added

- Task ID generation logic for defect tasks (scan phase, increment highest number)
- `FEATURE.md` task table update instruction when defect tasks are appended
- Sub-agents must read `MEMORY.md` of `depends-on` tasks for context handoff
- Gate column check: sub-agents check `Gates` column before marking tasks complete

### Changed

- Defect tasks use `originator: defect:<parent-task-id>` syntax (was `<parent-task-id>`)
- Defect tasks now create standard task directories, not flat files

## [1.1.0] - 2026-07-08

### Added

- Mermaid flowchart diagram documenting full execution flow
- Defect review loop: user feedback grouped into tasks, approved, then executed
- Per-phase commit workflow (commits happen after each phase, not at end)

### Changed

- Removed SINGLE/MULTI mode concept; always executes per-phase with sub-agents
- Pipeline: Load State → Execute Phase → Review/Defect Loop → Per-Phase Commit → next phase
- Active phase determined automatically from task states (first phase with pending/in-progress)
  - Removed `managing-feature-spec-defects` dependency; defects originate from user feedback **and** from accepted `review`-task findings (remediation tasks) — see the 1.3.0 `review` flow
- `caveman-compression` applies to file writes only, skill referenced via markdown link
- GATES.md: removed mode gate, split Phase Transition into Review/Defect Loop and Per-Phase Commit

## [1.0.0] - 2026-07-08

### Added

- Initial release of executing-feature-spec
- Task execution by type (exploratory, planning, execution, interruptor, defect)
- End-of-phase interruption with flat defect handling
- Final commit workflow via planning-git-commits
- Skill structure aligned with authoring-skills standard (When To Use, Pipeline, Reference)
