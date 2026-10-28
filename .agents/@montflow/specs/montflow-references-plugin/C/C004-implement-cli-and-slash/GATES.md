# GATES

## Stage 0: Verbs

- [ ] `mf-references --help` lists `list`, `show`, `verify`, `add`, `update`, `sync`, `status`, `remove`
- [ ] `list`, `show`, `verify`, and `status` render compact agent-first output by default
- [ ] `--human` renders readable tables/prose and composes with `--verbose`
- [ ] the slash command exposes the same verb set

## Stage 1: Safety

- [ ] `sync` with no name and no `--all` is a usage error
- [ ] a refusal exits non-zero without calling `process.exit`
- [ ] `remove --keep-clone` keeps the clone; `status` exits 0 with a summary
