# GATES

## Stage 0: Rule and spec commands

- [x] `AGENTS.md` says verification is always scoped and names the global-gate exceptions
- [x] the per-CLI scoped command table is present in `AGENTS.md`
- [x] `bun run --cwd packages/specs cli check --dir $PWD --name montflow-references-plugin` passes
- [x] a grep finds no `cli check --name` example without `--dir`
- [x] `bookkeeper` and `spec-bookkeeper` scoped commands run successfully

## Stage 1: Payload and entrypoint

- [x] the packaged skill version matches its newest changelog entry
- [x] the embedded payload drift test passes
- [x] the scoped spec entrypoint forwards `--name` and passes
- [x] `mf:check:skills` and `mf-specs doctor --check` pass
