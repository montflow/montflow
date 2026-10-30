# Memory

## Context

Phase E removes internal Pi-era names and guards the tree.

## Progress

- Renamed `modules/pi-profiles/` to `modules/profile/` (`profile.module.ts`), renamed the `PiProfiles` namespace to `Profiles` across the package and workspace, and dropped the redundant `PiProfile` alias. Profiles (26 files) and workspace (48 files) suites pass.

## Open Questions

- None.

## Handoff

- Keep behaviour identical; this phase is a rename and a guard.

## Deviations

- None.
