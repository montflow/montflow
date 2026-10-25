# Changelog

## [3.0.0] - 2026-10-12

### Changed (breaking)

- Renamed `addressing-adversarial-review` → `montflow-addressing-adversarial-review`; the `adversarial-review` dependency is now `montflow-adversarial-review`.
- Resume the series with `mf-reviews resume <name>` to locate the latest round (Step 1).

## [2.0.0] - 2026-10-12

### Changed (breaking)

- **Fixes the latest round in a series.** The target is `.agents/@montflow/reviews/<name>/<latest>/REVIEW.md` (the highest-numbered round directory), not a single `<code>.md` file. The fixer edits that round in place and never creates, renames, or deletes a round — only the reviewer adds rounds.
- Round format: `#### Discussion` threads (was `###`), `Iteration` removed, and the series ledger `.agents/@montflow/reviews/<name>/REVIEW.md` must stay consistent with the round's findings.
- Shipped as a package payload of `@montflow/pi-reviews`; `mf-reviews doctor` installs it into `.agents/skills/`.

## [1.1.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter

## [1.0.0] - 2026-07-18

### Added

- Initial release of montflow-addressing-adversarial-review — the **fixer** half of the montflow-adversarial-review loop.
- Consumes a review file at `.agents/@montflow/reviews/<name>/<code>.md` produced by montflow-adversarial-review v3.0.0+ and resolves findings across fix→re-review loops via the shared per-finding `### Discussion` thread.
- Per-finding `Attempts` counter written only by the fixer (never reset, never decremented); the reviewer never touches it.
- Status lifecycle the fixer owns: `Open` → `In Review` (fix applied + locally verified), `Won't Fix` (dismissed with rationale), `Escalated` (hit `Max Attempts: 3` default, surfaced to human).
- Hard role-boundary table — fixer never edits reviewer-authored fields, `Iteration`, or any prior Discussion turn (append-only thread).
- Legacy-format normalization on load: findings missing `ID`/`Attempts`/`### Discussion` are backfilled with `Attempts: 0`, `Status: Open`, and an empty Discussion block, with a top-level `[Fixer]` note in Review Metadata.
- Explicit gate that `Won't Fix`, `[Human]` resolution, and ceiling skips do NOT consume an attempt budget.
