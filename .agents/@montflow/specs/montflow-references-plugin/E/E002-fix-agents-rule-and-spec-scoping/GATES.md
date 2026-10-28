# GATES

## Stage 0: Rule and spec commands

- [ ] `AGENTS.md` says verification is always scoped and names the global-gate exceptions
- [ ] the per-CLI scoped command table is present in `AGENTS.md`
- [ ] `bun run --cwd packages/specs cli check --dir $PWD --name montflow-references-plugin` passes
- [ ] a grep finds no `cli check --name` example without `--dir`
- [ ] `bookkeeper` and `spec-bookkeeper` scoped commands run successfully

## Stage 1: Payload and entrypoint

- [ ] the packaged skill version matches its newest changelog entry
- [ ] the embedded payload drift test passes
- [ ] the scoped spec entrypoint forwards `--name` and passes
- [ ] `mf:check:skills` and `mf-specs doctor --check` pass
