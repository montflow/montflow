# Memory

## Context

- Closed phase A of the `installation-guide` spec with the general reviewer
  series (standalone round, isolated subagent).

## Progress

- Round: `.agents/@montflow/reviews/installation-guide/001/REVIEW.md` (2026-10-26).
- Findings: 10 total — 1 Critical, 3 Major, 3 Minor, 3 Nit; all `Open`.
- F1 fresh-checkout commands fail without `bun install` (Critical);
  F2 nonexistent `mf-profiles doctor` command; F3 reference registration
  overwritten by sync; F4 `syncing-skills` gate requires a `GATES.md` 26 of 46
  skills lack.
- Series ledger `.agents/@montflow/reviews/installation-guide/REVIEW.md`
  updated; `bun run --cwd packages/reviews cli verify --all --dir "$PWD"`
  passes (2 files, 0 issues).

## Open Questions

- F1: allow `bun install` inside the read-only reference clone, or require a
  real checkout before local mode?
- F3: where should the reference inventory live so `mf-skills sync` no longer
  overwrites it?

## Handoff

- Fixer: resolve findings in
  `.agents/@montflow/reviews/installation-guide/001/REVIEW.md` via
  `montflow-addressing-adversarial-review`; every finding starts `Open`,
  `Attempts: 0`.
- Phase A task statuses untouched (A001/A002 stay `complete`); A099 stays
  `pending`.

## Deviations

- None.

## Round 002 (2026-10-26) — re-review of round 001

- Round file: `.agents/@montflow/reviews/installation-guide/002/REVIEW.md` (Phase A, re-review, isolated).
- Resolved and dropped as terminal (9): F1, F2, F4, F5, F6, F7, F8, F9, F10 — each verified in the code/docs, not from `[Fixer]` claims.
- Still broken, carried Open (1): F3 (remote-mode seeding still happens after the `adding-references` registration step that needs the file).
- New in 002 (3): F11 Major — `mf-skills sync` is not implemented (`Unknown subcommand "sync"`); docs-ahead-of-implementation, closes with B001/B002. F12 Minor — "read-only" reference clone is where the guide requires `bun install`. F13 Minor — bare `mf-skills` instructions in `packages/profiles/CLI.md` and the workspace TUI hint are not on `PATH`.
- Remaining open: 4 (F3, F11, F12, F13).
- Verification: `bun run --cwd packages/reviews cli verify --all --dir "$PWD"` → 3 files, 0 issues; `bun run mf:check:skills` → green.

## 2026-10-26 — Round 003 (phase A, final re-review)

- Verdicts: F3 Resolved, F12 Resolved, F13 Resolved; F11 stays Won't Fix (phase-boundary claim `B001`/`B002` pending confirmed true).
- New: F14 Major Open — re-adding the montflow registry row after sync makes `sync --check` always report drift and exit 1; `syncing-skills` GATES cannot pass against a registered reference.
- Round: `.agents/@montflow/reviews/installation-guide/003/REVIEW.md`
- Verify: `mf-reviews verify --all` → 4 files, 0 issues; `mf:check:skills` → 46 skills, 0 issues.

## Round 004

- Re-review of phase A. F14 verified `Resolved`: registration now targets
  `.agents/references/registry.md`, outside the `<root>/.agents/skills/` tree
  that `sync`/`--check` compares, so no locally edited synced file remains.
- F11 `Won't Fix` re-confirmed: `B001`/`B002` still pending, no sync engine or
  CLI surface in `packages/skills/src`.
- New findings: F15 (Minor — remote mode dead-ends in a non-git workspace
  because `adding-references` aborts), F16 (Nit — `adding-references` and
  `finding-references` changed behavior with no version bump or changelog
  entry).
- Verified: `mf-reviews verify --all` (5 files, 0 issues), `mf:check:skills`
  (46 skills, 0 issues).

## Round 005 — Phase A close-out (2026-10-26)

- Review series `installation-guide`, round `005`, closed: F15 and F16 verified
  resolved in the files (git prerequisite in `guides/installation.md:15-17`;
  both skills at `2.3.0` with dated `[2.3.0]` CHANGELOG entries), no new
  findings.
- Phase A is doc-complete: `guides/installation.md` coherent end to end, all
  relative links resolve, no `npx skills` or global-install instruction in
  shipped docs, registry overlay `.agents/references/registry.md` lives outside
  the sync unit of work, and every `mf-*` command is scoped through
  `bun run --cwd <checkout>/packages/<domain>`.
- Checks run: `bun run --cwd packages/reviews cli verify --all --dir "$PWD"`
  (6 files, 0 issues), `bun run mf:check:skills` (46 skills, 0 issues),
  `bun run mf:check:specs` (6 specs, 0 issues).
- Handoff to phase B: F11 (`Won't Fix` in this series) is the live dependency —
  `mf-skills sync` does not exist in `packages/skills/src/apps/cli`, so the
  documented install command cannot run until B001/B002 land. B001 must match
  the documented contract: per-skill directory copy from `--from` (default: the
  checkout the package runs from) into `<root>/.agents/skills/<name>/`, skip
  `metadata.internal: true`, name outcomes added/updated/unchanged/skipped,
  `--check` writes nothing and exits 1 on drift, and never reads
  `.agents/references/` (the registry overlay stays outside sync).
- Phase C owns the per-utility install sections and the install-all recipe;
  nothing was filed for it here. A099 is ready for the orchestrator to close.
