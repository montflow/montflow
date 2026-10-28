# Memory

## Context

Phase B shipped the on-demand `Bun.serve` viewer with a DOM virtualized list.
Reviews ran through round 004 across the spec series and the `effect-reviewer`
series.

## Progress

- 2026-10-28: complete by supersession. The user rejected the DOM surface's look
  and chose an owned realtime canvas timeline (`C001`). The phase B renderer is
  replaced, so the review is closed rather than iterated against code that will
  not ship.
- Findings were written and reviewed through round 004. Data-layer findings
  still relevant to the replacement are carried into phase C: C002 owns the live
  append/rewrite/tab/session-freshness findings, C003 owns icon/tooltip/
  redaction/inspector findings, and C099 re-reviews the combined result.

## Open Questions

- None beyond the transferred findings recorded in the round files.

## Handoff

- Do not resume B099 as a renderer review. C099 is the closing review for the
  realtime surface; verify the carried data-layer findings there.

## Deviations

- The phase B surface decision (`B001`) is superseded by `C001`; the phase B
  data layer, lifecycle, and collector isolation remain in force.
