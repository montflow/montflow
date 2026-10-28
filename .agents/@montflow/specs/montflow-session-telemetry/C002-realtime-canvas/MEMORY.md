# Memory

## Context

C002 replaces the phase B DOM row list with the canvas surface chosen in C001.
The data layer is already shipped: NDJSON tail by offset, fold into
`telemetry.db`, one SQLite adapter, and `/api/live` seeded from fold offsets.

The live loop must carry the phase B re-review findings that were still open
when the surface changed: appends to a day file shorter than the fingerprint
window, a rewritten day file larger than the old offset, multiple tabs sharing a
viewer, and session-list freshness after a new session starts.

## Progress

- pending

## Open Questions

- Does a 400ms poll plus a canvas append meet the one-second growth budget at
  20k spans, or does the live path need SSE?
- How much of the trace should reconcile from history on reconnect versus
  relying on the live buffer?

## Handoff

- C003 consumes the icon slot and hit-test lookup this task exposes.

## Deviations

- None.
