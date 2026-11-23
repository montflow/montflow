# Changelog

## [1.6.0] - 2026-11-23

### Added

- Layout Selection for bare repos (`<root>/.bare/` with sibling worktrees): worktrees at `<root>/<prefix>/<name>`
- mf-mode worktrees at `<root>/mf/<prefix>/<name>` in the bare layout
- Step 4 gates agent start: `direnv allow` in the worktree when `.envrc` exists, then the dependency install, each checked before any agent starts
- Step 6 opens a herdr workspace (`herdr workspace create --no-focus`) for the new worktree when herdr is present, after setup
- Guidance that agents commit and push from inside the worktree, and need write access to the shared git dir

## [1.5.0] - 2026-10-12

### Added

- New Step 1 gathers worktree parameters before creation: type (feature, fix, hotfix, refactor, etc.), name, origin/base branch, and whether to push
- Worktree path and branch now use the typed `<prefix>/<name>` form (e.g. `feat/<name>`)
- Optional Step 3 pushes the new branch to `origin` (`git push -u origin <branch>`) when requested

### Changed

- Git fallback creates the worktree from the chosen base branch (`git worktree add <path> -b <branch> <base>`) instead of always branching from `HEAD`
- Native-tool branch (2a) now receives the gathered branch name and base when supported
- Renumbered creation, project setup, and baseline steps

## [1.4.0] - 2026-10-07

### Changed

- Added missing `author` and `license` frontmatter fields
- Renamed the `# Using Git Worktrees` body heading to `# Pipeline` and added `# Reference` (schema conformance)
- Fixed the malformed frontmatter description

## [1.3.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter
