# Memory

## Context

Task C009: add the severity-aware review-cycle policy on top of C001's derived
state, C005's claim/verb rail, and C006's shipped payloads. User-requested after
the Phase B review exposed that a Minor/Nit-only round still spends a full
review and a Major at the cap has no bounded path.

## Progress

- 2026-11-03: pending, added to Phase C after the Phase B lock.

## Findings

- None yet.

## Open Questions

- None yet. The policy is decided in `TASK.md`: `fix-and-stop` on Minor/Nit only,
  one autonomous overflow (`budget + 1`), guided escalation with per-round user
  authorization.

## Handoff

- Depends on C001 (structure/lifecycle), C005 (`claim` and the state verbs), and
  C006 (shipped prompt/profile payloads). C007 documents the verb; C099 reviews it.

## Deviations

- None yet.
