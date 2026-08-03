# Changelog

## [1.1.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter

## [1.0.0] - 2026-07-18

### Added

- Initial release of addressing-adversarial-review — the **fixer** half of the adversarial-review loop.
- Consumes a review file at `.agents/reviews/<name>/<code>.md` produced by adversarial-review v3.0.0+ and resolves findings across fix→re-review loops via the shared per-finding `### Discussion` thread.
- Per-finding `Attempts` counter written only by the fixer (never reset, never decremented); the reviewer never touches it.
- Status lifecycle the fixer owns: `Open` → `In Review` (fix applied + locally verified), `Won't Fix` (dismissed with rationale), `Escalated` (hit `Max Attempts: 3` default, surfaced to human).
- Hard role-boundary table — fixer never edits reviewer-authored fields, `Iteration`, or any prior Discussion turn (append-only thread).
- Legacy-format normalization on load: findings missing `ID`/`Attempts`/`### Discussion` are backfilled with `Attempts: 0`, `Status: Open`, and an empty Discussion block, with a top-level `[Fixer]` note in Review Metadata.
- Explicit gate that `Won't Fix`, `[Human]` resolution, and ceiling skips do NOT consume an attempt budget.