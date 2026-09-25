# Feature module

Schema + verification for the top-level `FEATURE.md`: the feature
descriptor (name, status, workspace-type, author, created,
locked-phases), the body shape, and the task table.

Singular name per the TypeScript modules skill (`feature` → `Feature`).

Note: namespace + class share the name, so call-site reads
`Feature.Feature`.

## Belongs here

- `Feature` Schema Class, `FeatureStatus`, `WorkspaceType`, `PhaseId`
- Patterns: `SLUG_PATTERN`, `PHASE_PATTERN`, `ISO_DATE_PATTERN`
- `parseFeatureFile`, `verifyFeatureFile`
- The task table: `TaskRow`, `parseTaskTable` (and its column-value
  validation inside `verifyFeatureFile`)
- Slug helpers (`isValidName`, `slugify`)

## Does not belong here

- `TASK.md` — the `task` module owns it
- `GATES.md` / `MEMORY.md` — `gates` / `memory` own them
- Cross-file structure (task placement, table↔directory agreement,
  dependencies) — `structure` owns it
- Frontmatter grammar — the `frontmatter` module owns it
