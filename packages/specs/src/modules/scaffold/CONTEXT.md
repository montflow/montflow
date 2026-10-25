# Scaffold module

Pure renderer for a fresh spec tree. Turns a spec name, metadata, and a
short task list into the exact `SpecFileEntry[]` the `SpecStore` writes —
`SPEC.md`, one task directory per task with `TASK.md` + `MEMORY.md` (+
`GATES.md` when gated), and the phase's single `review` task. No IO, no
model, no clock: the caller supplies `created` and writes the files.

This is the mechanical half of `mf-specs create`; agentic spec authoring
dispatches a session (`prompt` module) instead.

## Belongs here

- `renderSpecScaffold`, `ScaffoldSpecInput`, `ScaffoldTask`, `ScaffoldResult`
- `SCAFFOLD_TASK_TYPES` — the non-`review` types a scaffold may request
- The file templates every scaffolded spec must satisfy

## Does not belong here

- Writing files — `SpecStore` owns the filesystem
- Verification — `structure` / `spec` / `task` own the rules
- Parsing CLI or slash arguments — the `cli` app owns them
