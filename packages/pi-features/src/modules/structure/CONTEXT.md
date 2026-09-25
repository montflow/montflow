# Structure module

Tree-level mechanical verification for a whole feature spec. One
`FeatureSnapshot` (a feature directory's files, in memory) is checked as
a whole.

Pure — the caller supplies file paths and contents; this module never
touches disk. Composes the per-file verifiers from `feature`, `task`,
`gates`, and `memory`.

## Belongs here

- `FeatureSnapshot`, `FeatureFileEntry` — the in-memory directory shape
- `verifyFeatureTree` — required files, task-directory naming and
  placement, id/name agreement, unique ids, task-table agreement
  (name/type/status/gates), `locked-phases`, dependency existence /
  phase ordering / cycles, one `review` task per phase
- Nesting the per-file issues under their path

## Does not belong here

- Per-file parsing and verification — `feature` / `task` / `gates` /
  `memory` own those
- File IO (reading the directory, walking paths) — the consuming
  extension owns that
- Deciding what to do with issues (render, fix, abort) — adapters
