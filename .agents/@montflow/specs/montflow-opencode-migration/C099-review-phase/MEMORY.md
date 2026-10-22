# Memory

## Context

Independent adversarial review of Phase C (C001–C007). Series:
`.agents/@montflow/reviews/montflow-opencode-migration-c/`. Round 001 was produced
by a fresh, isolated reviewer; fixes and re-reviews followed the
fix→re-review loop.

## Progress

- complete — 6 rounds; 23 findings filed (2 Critical, 5 Major, 7 Minor, plus
  nit-level follow-ups), all resolved; series closed with `pass`.

## Findings

### Review outcome

- Round 001: 15 findings (2 Critical, 5 Major, 6 Minor, 2 Nit).
  - Critical: `SkillPort`/`AgentPort` disposed their replay-based host
    transforms (registrations vanished); skills settle watcher forked on the
    tool-execute fiber so it never ran.
  - Major: `/specs` dropped its arguments and used `process.cwd()`; the
    workspace `.test.tsx` suite was ungated; packed artifacts omitted
    `@opencode/schema`; the specs verify still ran `pi-specs`;
    `.pi/settings.json` named deleted packages.
- Round 002: all 15 resolved; 3 new (panel-aware `esc`, stale skills CONTEXT,
  relative `--dir`).
- Rounds 003–005: carried fixes verified; doc-accuracy nits iterated to truth.
- Round 006: F22 resolved, no new findings, series **closed / pass**.

### Required confirmations

- **Pin set.** `@effect/platform-node-shared` is pinned at `4.0.0-rc.112` in
  root `overrides`; `verify:montflow:compat` fails when the override is removed
  or set to `4.0.3` (reviewer mutation-tested both, restored clean).
- **`pi-specs`.** Still installed and loadable through C001–C005; the specs
  extension verify now targets `packages/specs` (F6), and `pi-specs` remains a
  root devDependency / `.pi` entry.

## Open Questions

- None. Review series is closed.
- Non-blocking: adapter imports some `@opencode/schema/*` values at runtime;
  distribution treats `@opencode/*` as host-provided. Consider a future
  type-only pass.

## Handoff

- Phase C is complete and locked. `verify:montflow` green (17/17 turbo tasks,
  including the TUI suite and loader smoke; compat 0 drift; distribution 0
  problems; all extension verifies 0 issues).
- Review artifacts are git-ignored; spec files are the source of truth.

## Deviations

- **Dispatch vehicle.** The spec assumed `mf-sessions` dispatch via the
  spec-execution orchestrator. Phase C instead ran as OpenCode `general`
  subagents because the Pi session engine's credentials expired and the engine
  is itself retired in C006. No gate depends on `mf-sessions` (the
  `verify:montflow:sessions` script and CI cell are gone), and the reviewer
  re-ran the compat/distribution checks independently: no gate was compromised
  or weakened.
- **Phase C lock.** Applied directly in `SPEC.md` (`locked-phases: A, B, C`,
  `status: complete`) because the installed `mf-specs` CLI exposes no `lock`
  verb.
