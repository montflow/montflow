# Memory

## Context

Task B099: independent adversarial review of Phase B (the B001 reconciliation,
the B002 record retrofit, and the B003/B004/B005 decisions). Series
`montflow-spec-standard`, round `001`, `- Phase: B`, isolated reviewer
(`montflow-adversarial-review`), fixes applied by `montflow-addressing-adversarial-review`.

## Progress

- 2026-11-03: round `001` opened against the working tree.
- Four reviewer passes inside round `001` (in place, no new round; the budget
  counts rounds per phase, not attempts):
  1. 15 findings (F1–F15), verdict `rework`.
  2. 12 resolved, 6 open (F1, F3, F15, F16–F18), verdict `rework`.
  3. 6 resolved, 2 new (F19, F20), verdict `rework`.
  4. F19 and F20 resolved, no new defect, verdict `pass`.
- Round closed `- Status: closed`; ledger closed. 20 resolved, 0 open, 0 escalated.

## Findings

- Series: `.agents/@montflow/reviews/montflow-spec-standard/` — round `001`;
  ledger `Status: closed`; `mf-reviews verify --all` → `2 files · 0 issues`.
- The findings that mattered:
  - F2 (Major) — `migrate` rolled back a failed move but not a failed
    post-move verification. Fixed with one rollback path and a real-FS test
    that fails against the old code.
  - F4/F17 (Major) — the tier waiver rules contradicted each other. One rule
    now: `micro` waives any phase, `standard` enforces `records-only`, `full`
    forbids waivers.
  - F5/F16 (Major) — `claim` had lost the atomic status write, leaving hand
    edits of three records. `claim` is again the atomic generator, restricted
    to the orchestrator binding; workers bind/release only.
  - F6/F7/F8/F11 (Major) — migration ownership and the C004/C006 sequence were
    inconsistent. The live `migrate --all` is C005's, C004 covers
    skill/profile/prompt plus a fixture-tested tier, C006 ships six profiles.
  - F1 (Major) — B002 overstated its evidence. Re-audited all 23 unchecked
    gate items: 7 ticked from fresh runs, 16 carry per-item retirement notes,
    completion item 4 amended to the contract that matches that evidence.
  - F14 (Minor) — the scaffold still reserved a `099` review task. Deleted
    with tests.
  - F20 (Major) — a blocked task had no verb path back. `claim --release`
    now resets `blocked|in-progress → pending`, tested end to end.
- Every finding has a terminal disposition (`Resolved`); none `Open`.

## Open Questions

- None. The user separately asked for a severity-aware review-cycle policy
  (stop on Minor/Nit, one autonomous overflow, guided halt at the cap). That is
  new Phase C scope (`C009`), not a Phase B finding, and is added after this
  lock.

## Handoff

- Phase B is complete and its round is closed; Phase C may start.
- `C009` (new, added after this review) owns `mf-specs review decide`, the
  `minor-deferred` closure, and the bounded overflow. It must update
  `review-link`, `structure`, `next`, the shipped prompt, and the orchestrator
  profile.
- C001–C008 remain traceable to B003/B004/B005 decisions; the re-review
  checked that mapping.

## Deviations

- Accepted findings were fixed inline through the fix→re-review loop rather
  than opened as separate defect tasks; each has a terminal disposition in the
  series. This is why the completion item about "opened as defect tasks" is
  checked with this note.
- The phase lock is **derived**, not written. B001 deleted the hand-written
  `locked-phases` field, so this spec's `SPEC.md` carries no lock list; the
  closed round above is the lock evidence and `mf-specs state` is the record.
- Round `001` is the only round for Phase B; the three rework passes are
  attempts inside it, not additional rounds.
