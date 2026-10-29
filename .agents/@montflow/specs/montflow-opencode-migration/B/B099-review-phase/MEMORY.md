# Memory

## Context

Task B099: independent adversarial review of the Phase B decisions (tasks
B001–B006). Run as a fresh, isolated reviewer under the
`montflow-adversarial-review` skill, series `montflow-opencode-migration-b`.

## Progress

- 2026-10-13: complete — review closed at round 006 (verdict `pass`).

## Findings

- Series: `.agents/@montflow/reviews/montflow-opencode-migration-b/` — rounds
  `001`–`006`; ledger `Status: closed`; `mf-reviews verify` → `✓ 7 review files verified.`
- 18 findings surfaced and resolved (7 Major, 4 Minor, 7 Nit). The material ones:
  - F1 (Major) — B004's workspace TUI bypassed the B002 adapter ports and B001's
    "only `@montflow/opencode` imports `@opencode/*`" invariant. Routed through the ports.
  - F2 (Major) — B002's "exact signatures" imported symbols that are not exported
    (`Plugin.Context`, `@opencode/plugin/tui/context`, `@opencode/schema/*`). Corrected.
  - F3 (Major) — NotifyPort contradiction (`notify_user`/`toast_user`/`update_status`
    retired in B003 vs registered in B001/B002/B004). Reconciled: retire the pi-sessions
    implementation, re-expose via `NotifyPort.registerTools()`.
  - F4 (Major) — private Git-URL install infeasible with `workspace:*` internal deps.
    Specified workable mechanisms (prebuilt manifest / local path).
  - F5 (Major) — externals list omitted host singletons not in the redirect map
    (`@opencode/schema`, `@opencode/client`). Widened + static check.
  - F6 (Major) — B003's per-consumer engine fallback impossible post-removal; rollback
    is now `git revert` of the isolated retirement commit.
  - F10 (Major) — B004 named the workspace plugin `@montflow/opencode` with server entry
    at `.`; corrected to `@montflow/workspace` / `./server`.
  - Remaining Minor/Nit findings were cross-reference and citation fixes (F7–F9,
    F11–F18).

## Open Questions

- Series naming: used `montflow-opencode-migration-b` per the same spec+phase convention
  as Phase A; the B099 text says "the `montflow-opencode-migration` review series".
- `mf-specs` still exposes no `lock`/`gate`/`stamp` verbs, so phase lock + task status
  were written by the orchestrator directly.

## Handoff

- Phase B locks clean; the execution phases (B005 proposes C001–C007) are authored
  next, per SPEC ("execution phases are authored after Phase B decides").

## Deviations

- Review series named `<spec>-b` rather than `<spec>`.
- Phase lock / task completion written without a CLI verb (verb not implemented).
