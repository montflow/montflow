# Changelog

## [1.2.0] - 2026-09-04

### Added

- New "Attitude" block and pipeline section 3 enforcing that wiki pages are final outputs, not planning documents
- "What a wiki page IS NOT" table listing forbidden sections (Decisions, Roadmap, Next steps, page-update notes, in-page Author/Changelog, Asking-the-reviewer, planning prerequisites)
- Verification step 6: scan for forbidden-section keywords and remove them; step 7: no standalone `# Title` header before the value statement
- Reference pointers to SKILL.md and existing wiki/ pages as living examples

### Changed

- Version bump 1.1.0 → 1.2.0
- Description updated to state "final outputs that state what a thing does, nothing more"

## [1.1.0] - 2026-08-30

### Changed

- Clarified skill targets human readers; agent-facing docs stay in AGENTS.md, .agents/skills/, and feature specs
- Folded GATES.md checks into SKILL.md pipeline step 6 (Verify)

### Removed

- GATES.md

## [1.0.0] - 2026-08-25

### Added

- Initial release of contributing-to-wiki skill
- Pipeline: locate/create wiki/, load context, ADHD-friendly prose via i-have-adhd, Mermaid diagrams when they clarify, extensive relative cross-linking, link verification
- GATES.md with three phases: prose style, diagrams, hyperlink graph
