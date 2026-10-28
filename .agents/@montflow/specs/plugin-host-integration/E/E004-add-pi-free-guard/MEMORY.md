# Memory

## Context

Phase E removes internal Pi-era names and guards the tree.

## Progress

- Added `scripts/check-pi-names.ts` and `mf:check:pi` (wired into `mf:check` and the CI matrix). It scans tracked files for retired names and allows only frozen history, generated payloads, the migration constant, and the third-party reference. Renamed the last incidental occurrences (temp prefixes, a lint comment).

## Open Questions

- None.

## Handoff

- Keep behaviour identical; this phase is a rename and a guard.

## Deviations

- None.
