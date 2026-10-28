# Memory

## Context

D099 reviews phase D: the removal of the three retired Pi packages
(`@montflow/pi-effect`, `@montflow/pi-interactive`, `@montflow/pi-specs`) and the
moves that let them go.

## Progress

- 2026-10-25: review round 004 written by the declared `effect-reviewer` profile
  (0 Critical, 2 Major, 5 Minor, 3 Nit), all 10 addressed in `[Fixer]` turns.
  The phase record lives in the spec's own series at the same round, so the
  review-link convention binds both series to phase D.
- 2026-10-25: round 005 re-review resolved 9 findings, reopened F4 and raised
  F11/F12. Round 006 resolved all three (0 Critical, 2 Minor, 1 Nit) and closed
  the series with `pass`; the phase record round 004 closed with it.

## Findings

### 1. The dispatched series name could never link

The review was first written to `montflow-opencode-migration-d-effect-reviewer`.
`ReviewLink.seriesNames` derives exactly `<spec>` and `<spec>-<profile>`, so that
name was invisible to the link check and phase D could never close. Both rounds
now live at the convention names, round `004` (`- Phase: D`).

### 2. Phases A–C had no round in the spec's own series

The link check requires a round attributed to every completed review phase in
the spec's series. Phases A–C were only ever reviewed in per-phase series
(`…-a`, `…-b`, `…-c`), so the workspace panel reported three `review-series`
issues for this spec. Rounds `001`–`003` in the spec's series are phase records
that attribute the phase and point at the legacy series' closing round; the
detailed findings stay in the legacy series, so nothing was fabricated or lost.
A `Specs.loadSpec` probe over the real store now returns `issues: []`.

### 3. The review found one duplicated implementation

`Changes.watchChanges` had no consumer while the profile store hand-rolled the
same watch; the module advertised it as shared infrastructure. It was deleted
and the `CONTEXT.md` contract corrected (a store owns its watch; a watch failure
ends the stream).

### 4. The swap needed a test, and the tests were thin

The `Changes` module gained a `TestClock` debounce test, and the workspace specs
service gained a fixture suite covering the list, the detail, the review-series
link in both convention series, a missing profile series, and a missing store.

## Open Questions

- None.

## Handoff

- None.

## Deviations

- None.
