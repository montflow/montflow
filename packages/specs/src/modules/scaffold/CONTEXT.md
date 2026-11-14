# Scaffold module

Pure renderer for a fresh spec tree. Turns a spec name, metadata, and a
short task list into the exact `SpecFileEntry[]` the `SpecStore` writes —
`SPEC.md` and one task directory per task with `TASK.md` + `MEMORY.md` (+
`GATES.md` when gated). A `review` task is emitted only when the caller requests
it; nothing is reserved or auto-appended. No IO, no model, no clock: the caller
supplies `created` and writes the files.

This is the mechanical half of `mf-specs create`; agentic spec authoring
renders the `spec-create` prompt (`modules/prompt`, or `mf-specs author`)
instead.

## Belongs here

- `renderSpecScaffold`, `ScaffoldSpecInput`, `ScaffoldTask`, `ScaffoldResult`
- `SCAFFOLD_TASK_TYPES` — the task types a scaffold may request, including an explicit `review` task
- The file templates every scaffolded spec must satisfy, including the
  `size` line every generated `TASK.md` carries

## Does not belong here

- Writing files — `SpecStore` owns the filesystem
- Verification — `structure` / `spec` / `task` own the rules
- Parsing CLI or slash arguments — the `cli` app owns them
