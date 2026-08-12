# Changelog

## [1.3.0] - 2026-08-12

### Changed

- AGENTS.md registration is no longer mandatory — GATES.md Phase 4 gate is now conditional (only if the project maintains a skill index there)
- Pipeline Step 2: added optional "Register in AGENTS.md" sub-step pointing to setup-agentic-repo

## [1.2.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter — 16-char hex, generated via `SCRIPTS/generate-skill-id.sh`
- Created `SCRIPTS/generate-skill-id.sh` for generating unique skill IDs
- Updated template SKILL.md with `id` placeholder
- Updated GATES.md to validate `id` field

## [1.1.2] - 2026-07-14

### Changed

- Updated group entries: `adding-vendor` → `adding-references`, `finding-vendors` → `finding-references`, `vendors` → `references`
- Updated group descriptions from "vendor" to "reference" terminology

## [1.1.1] - 2026-07-09

### Fixed

- Updated `grill-me` table entry to `grilling` after skill rename

## [1.1.0] - 2026-07-09

### Added

- Added `executing-skills` as required dependency in frontmatter
- Added prerequisite alert after "When To Use" referencing executing-skills
- Pipeline Step 2: all generated skills MUST list `executing-skills` as a dependency
- Pipeline Step 4: added instruction to include prerequisite alert after "When To Use"
- Template SKILL.md includes `executing-skills` in default dependencies and prerequisite alert

## [1.0.0] - 2026-07-08

### Added

- Initial release of authoring-skills skill
- Standard skill structure: When To Use, Prerequisites, Pipeline, Reference
- GATES.md replaces CHECKLIST.md with phased validation (sequential phases, parallel checks)
- TEMPLATES.md with standard skeleton matching the new structure
- examples/ directory with example skills
- Standardized frontmatter with required `name`, `description`, `author`, `version` fields
- Optional frontmatter fields: `license`, `language`, `groups`, `dependencies`
- `dependencies` includes [caveman-compression](../caveman-compression/SKILL.md) as a required dependency
