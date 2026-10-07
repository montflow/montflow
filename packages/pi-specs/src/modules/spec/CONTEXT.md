# Spec module

Schema + verification for the top-level `SPEC.md`: the spec
descriptor (name, status, workspace-type, author, created,
locked-phases), the body shape, and the task table.

Singular name per the TypeScript modules skill (`spec` → `Spec`).

Note: namespace + class share the name, so call-site reads
`Spec.Spec`.

## Belongs here

- `Spec` Schema Class, `SpecStatus`, `WorkspaceType`, `PhaseId`
- Patterns: `SLUG_PATTERN`, `PHASE_PATTERN`, `ISO_DATE_PATTERN`
- `parseSpecFile`, `verifySpecFile`
- The task table: `TaskRow`, `parseTaskTable` (and its column-value
  validation inside `verifySpecFile`)
- Slug helpers (`isValidName`, `slugify`)

## Does not belong here

- `TASK.md` — the `task` module owns it
- `GATES.md` / `MEMORY.md` — `gates` / `memory` own them
- Cross-file structure (task placement, table↔directory agreement,
  dependencies) — `structure` owns it
- Frontmatter grammar — the `frontmatter` module owns it
