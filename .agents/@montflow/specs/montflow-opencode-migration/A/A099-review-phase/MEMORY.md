# Memory

## Context

Task A099: independent adversarial review of the Phase A inventory and migration
contract (tasks A001–A006). Run as a fresh, isolated reviewer under the
`montflow-adversarial-review` skill, series `montflow-opencode-migration-a`.

## Progress

- 2026-10-13: complete — review closed at round 004.

## Findings

- Series: `.agents/@montflow/reviews/montflow-opencode-migration-a/` — rounds
  `001`–`004`; ledger `Status: closed`; `mf-reviews verify` → `✓ 5 review files verified.`
- Eight findings surfaced and resolved across the fix→re-review loops:
  - F1 (Major) — A003/A006 called the `pi-sessions` transcripts "committed"; they
    are git-ignored local files (`.gitignore:266-267`). Blocker re-scoped.
  - F2 (Major) — A006/A003 mapped plugin `ctx.session.resume`/`.messages`/`.list`/`.log`,
    none on the plugin `SessionDomain` `Pick` (v2.0.18). Re-mapped.
  - F3 (Minor) — runtime redirect map miscounted as "seven"; it is six
    (`packages/cli/vite.node.config.ts:160-167`).
  - F4 (Minor) — `.changeset/config.json` `ignore` lists six of ten `pi-*`, not all.
  - F5 (Minor) — A004 cited `handleDialogKey` at `app.tsx:717`; defined at `:2024`.
  - F6 (Minor) — `notify_user`/`toast_user`/`update_status` are tools; replacement is a
    montflow-registered ToolPort over `Toast`/`Attention`/`session.synthetic`.
  - F7 (Minor) — A003 Context omitted a no-exact-analog item listed in §4.
  - F8 (Minor) — A006 still mapped `ctx.session.fork` and a `ctx.session.steer` method;
    both absent from the plugin surface.
- The retire-`pi-sessions` verdict was independently re-verified against the pinned
  v2.0.18 source (steer/queue, durable inbox, interrupt, resume, subagent parent/child
  + depth, background jobs, receipts all resolve to real code) and holds.

## Open Questions

- Series name: A099's text says "the `montflow-opencode-migration` review series";
  this run used `montflow-opencode-migration-a` per the `spec-execution-orchestrator`
  profile's spec+phase convention, so Phase B can open its own series. Confirm the
  intended naming.
- `mf-specs` exposes no `lock`/`gate`/`stamp` verbs (montflow-spec-standard C005 is
  still pending), so the phase lock and task statuses were written by the orchestrator
  directly rather than through a CLI verb.

## Handoff

- Phase B (B001–B006) may proceed; B099 should open series
  `montflow-opencode-migration-b`.

## Deviations

- Review series named `<spec>-a` rather than `<spec>`.
- Phase lock / task completion written without a CLI verb (verb not implemented).
