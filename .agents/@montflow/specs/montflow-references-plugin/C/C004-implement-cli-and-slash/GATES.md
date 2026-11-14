# GATES

## Stage 0: Verbs

- [x] `mf-references --help` lists `list`, `show`, `verify`, `add`, `update`, `sync`, `status`, `remove`
- [x] `list`, `show`, `verify`, and `status` render compact agent-first output by default
- [x] `--human` renders readable tables/prose and composes with `--verbose`
- [x] the slash command exposes the same verb set

## Stage 1: Safety

- [x] `sync` with no name and no `--all` is a usage error
- [x] a refusal exits non-zero without calling `process.exit`
- [x] `remove --keep-clone` keeps the clone; `status` exits 0 with a summary
