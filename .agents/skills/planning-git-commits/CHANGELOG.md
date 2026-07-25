# Changelog

## [1.2.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter

## [1.1.0] - 2026-07-18

### Added

- **Step 0**: Repository state validation — checks merge conflicts, detached HEAD, staged changes, no-changes guard
- **Scope derivation**: 4 explicit rules with concrete examples for package/app, top-level, root, and multi-scope files
- **Message Quality**: Imperative present-tense requirement, min 3 words, max 72 chars
- **Breaking Changes**: `!` after scope and `BREAKING CHANGE:` footer support
- **Build type**: Added to conventional commits table
- **Step 5 (Push - Optional)**: Remote/branch detection, user confirmation, push command, error handling
- **Rules**: 3 new rules — path injection prevention with `--` separator, no wildcard staging, error reporting on failure
- **Error Handling**: Commit failure recovery with user notification, no auto-retry, pre-commit hook awareness
- **Plan format**: Bulleted file lists with concrete examples, guidance on splitting large commits

### Fixed

- Untracked files now handled via explicit `git add -- <files>`
- Pre-existing staged changes now detected and unstaged before planning
- Shell injection mitigated by `--` separator and proper escaping
- Commit message now delivered via `-m` flag instead of interactive editor

## [1.0.1] - 2026-07-09

### Added

- Added `executing-skills` as required dependency in frontmatter
- Added prerequisite alert after "When To Use" referencing executing-skills

## [1.0.0] - 2026-07-08

### Added

- Initial release of planning-git-commits
- Commit planning workflow with conventional commit format
- File grouping and scope derivation from paths
- Standardized skill format with frontmatter, pipeline, and reference sections
