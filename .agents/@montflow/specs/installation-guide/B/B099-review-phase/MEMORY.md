# Memory

## Context

Phase B review (`installation-guide` round 006) of the sync engine and both CLI
surfaces — engine `packages/skills/src/apps/sync/`, the `mf-skills sync` binary
command, the `/mf-skills sync` slash path, the colocated tests, and the phase B
changelogs.

## Progress

- Round written: `.agents/@montflow/reviews/installation-guide/006/REVIEW.md`
  (`Phase: B`, `Type: standalone`, `Isolation: isolated`).
- Counts: 0 Critical, 4 Major, 6 Minor, 1 Nit — 11 findings, all `Open`.
  IDs F1–F11 (Major: F1 compiled-binary default source, F2 empty `--from=`
  self-source, F3 boolean `=false` divergence, F4 symlinked target escape;
  Minor: F5 internal-detection spellings, F6 empty source `✓ current.`,
  F7 non-atomic writes, F8 slash relative-path cwd, F9 hardcoded refusal in the
  slash front end, F10 test coverage gaps; Nit: F11 README/guide omit
  `--verbose`).
- Ledger updated: `.agents/@montflow/reviews/installation-guide/REVIEW.md`
  (`Rounds: 6`, round 006 row, F1–F11 index rows, status `open`).
- `bun run --cwd packages/reviews cli verify --all --dir "$PWD"` → 7 files, 0
  issues.
- Supporting checks run during the review: `bun run --cwd packages/skills test --
  sync` (4 files, 48 tests, no type errors), `bun run mf:check:skills`,
  `bun run mf:check:specs` — all green.

## Open Questions

- None.

## Handoff

- Fix round 006 in place per `montflow-addressing-adversarial-review`; F1–F4 are
  the ones that change behavior, F5–F10 need code, tests, or docs, F11 is a
  one-line doc edit.

## Deviations

- None. Task statuses were not changed.

## Round 007 — phase B re-review

- Round: `.agents/@montflow/reviews/installation-guide/007/REVIEW.md`
- Resolved (verified against the code, not the fixer narrative): F1 (compiled probe resolves the checkout from a checkout cwd; refuses from `/tmp` naming `--from`), F2 (`--from=`/`--dir=` default on both surfaces), F3 (boolean `=false`/`=true` and space form match the binary oracle), F4's covered shapes (symlinked skill directory and file refused), F5 (block/flow/quoted/top-level decoy), F8 (slash relative paths against session cwd), F9 (`SyncResult.invocation` + `Renderers.syncRefusal`), F10 (new tests fail for the enumerated regressions), F11 (`--verbose` in README and guide).
- Still open: F6 (a source store with no `SKILL.md` — only non-skill directories — still reports `No skills in the source store.`/`✓ current.` and exits 0), F7 (per-file atomic write works, but a mid-run write failure leaves a mixed-version skill and reports no completed outcomes).
- New: F12 (Major — a symlinked subdirectory inside a target skill lets sync create files outside the store; the containment check only resolves the candidate, not absent-path ancestors), F13 (Minor — the slash accepts uppercase boolean values and defaults bare `--from`/`--dir` where the binary refuses).
- Checks: `mf-reviews verify --all` 8 files / 0 issues; `mf:check:skills` 46 skills / 0 issues; `mf:check:specs` 6 specs / 0 failed; `packages/skills` tests 339 passed.

## Round 008 — phase B re-review

- Round: `.agents/@montflow/reviews/installation-guide/008/REVIEW.md`
- Resolved (verified by reproducing against the code): F6 (a source store holding only non-skill directories now fails with the source and `--from <checkout>` both with and without `--check`, target untouched; internal-only stores still pass as `skipped`), F12 (nested symlinked subdirectory with an absent destination refuses and leaves the outside directory empty — likewise a symlinked skill directory/file and a nested link with an existing outside destination; no `.tmp`), F13 (boolean token matrix, bare `--from`/`--dir`, malformed sync USAGE failure, and bare help success all match the binary).
- Still open: F7 (staging is atomic and the read-only/already-applied cases pass, but a rename failure after an earlier rename in the same skill leaves a mixed-version skill plus a surviving `.tmp`, and the report does not name the half-applied skill).
- New: F14 (Minor — after a staging failure that created directories, cleanup removes `created` shallowest-first and `Effect.ignore` aborts the rest, so empty `alpha/docs` stay behind), F15 (Major — only `sync` marks malformed input invalid, so `/mf-skills delete … --dir` and `create … --dir` act on the session workspace where the binary refuses, and other commands report malformed invocations as success).
- Checks: `mf-reviews verify --all` 9 files / 0 issues; `mf:check:skills` 46 skills / 0 issues; `mf:check:specs` 6 specs / 0 failed; `packages/skills` 44 test files / 361 tests / no type errors; package lint, format, and typecheck green.

## Round 009 — phase B re-review

- Round: `.agents/@montflow/reviews/installation-guide/009/REVIEW.md`
- Resolved (verified by reproducing against the code): F15 (every known command now validates its flag grammar and positional arity; `delete alpha --dir` and `create … --dir` fail `USAGE` with no write, malformed booleans/positionals fail, `doctor --verbose` and `--dir=value` accepted on both surfaces), F7 (the round-008 rename collision now rolls back to byte-identical bytes with no `.tmp`/`.bak`, the read-only staging case leaves old bytes, and a later-skill failure reports `already applied: …; failed: …`), F14 (the long-name staging failure leaves `<ws>/.agents` absent, cleanup sorted deepest-first with per-directory ignore).
- Still open: F16 (Major — relative `--dir` on list/show/verify/create/modify/delete resolves against the host process cwd, so `/mf-skills delete gamma --dir .` deleted the host store's skill and left the session store's skill; doctor/sync resolve correctly), F17 (Minor — the slash lexer takes `-x` as a flag value and writes where the binary reports `Unrecognized flag: -x`, while it refuses `--`, empty quoted values, and resolves duplicate `--dir` last-wins where the binary is first-wins), F18 (Minor risk — backups rename every destination aside before any temp rename, so a process kill in that window leaves changed files missing plus unrestored `.bak` files).
- Checks: `mf-reviews verify --all` 10 files / 0 issues; `mf:check:skills` 46 skills / 0 issues; `mf:check:specs` 6 specs / 0 failed; `packages/skills` 46 test files / 389 tests / no type errors.

### Round 009 — post-cap in-place verification

- No round 010 (user cap). F16–F18 were re-verified and resolved inside `.agents/@montflow/reviews/installation-guide/009/REVIEW.md`.
- F16 resolved: `run` resolves `dir`/`from` once against the session cwd; with process cwd at `host` and session cwd at `session`, list/show/verify/create/modify/delete/sync all read and write the session store (`delete gamma --dir .` removed the session skill, host store untouched).
- F17 resolved: `-x`/`- bullet` values are missing flags on both surfaces (no write), `--` terminates flags on both, empty quoted values survive on both, duplicate `--dir` is first-wins on both; `delete alpha -h` and flags-before-command remain minor safe-direction help differences (no write).
- F18 resolved: backups use `fs.copyFile`, so destinations stay present through publish and rollback; the collision repro leaves old bytes and no `.tmp`/`.bak`.
- Ledger: series `closed`, round 009 0 open / 6 resolved. `mf-reviews verify --all` 10 files / 0 issues; `packages/skills` 46 test files / 407 tests / no type errors.
