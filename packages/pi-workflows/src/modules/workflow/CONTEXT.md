# Workflow module

Effect-first workflow primitives for Pi extensions: a `Workflow`
descriptor holding an ordered pipeline of free-form `Step`s, plus slug
helpers for workflow names.

Modeled on the pipeline half of `pi/zi`'s preset schema
(`preset-schema.ts`): steps carry `id`, free-form `kind`, and optional
`label` / `prompt` / `model` / `fallbackModel` / `concurrency` /
`params`. The schema is deliberately loose — unknown kinds decode
untouched, never destroyed.

Singular name per the TypeScript modules skill (`workflow` → `Workflow`).

Note: namespace + class share the name, so call-site reads
`Workflow.Workflow`. This stutter is the cost of matching the skill's
folder convention and the Effect `Schema.Class` identifier (same as
`Run.Run`, `Skill.Skill`).

## Belongs here

- `Step`, `Workflow` classes plus boundary helpers (`decodeUnknown`,
  `encode`, `FromJson` for whole-file JSON round-trips)
- Descriptor constructors (`make`, `makeStep`)
- Slug helpers for workflow names (`isValidName`, `slugify`, `SLUG_PATTERN`)

## Does not belong here

- Review-loop execution controls (`maxLoops`, `deadlock`, reviewer refs)
  — those stay in `zi` until a loop module lands here
- Step execution and lifecycle (`start`, `settle`, run state) — a future
  store module owns that, referencing runs by id
- File IO — the consuming extension owns reading/writing workflow files
