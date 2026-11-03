# GATES

## Stage 0: Docs

- [x] README lists `@montflow/references` and its two skills
- [ ] INSTALL lists the plugin and its install command
- [x] AGENTS lists the `mf:check:references` scope
- [x] the CLI guide lists the new verbs and the `--human` / `--verbose` convention

## Stage 1: Verification

- [x] `bun run mf:check` passes
- [x] `bun run mf:gate:fast` passes
- [x] `bun run --cwd packages/references test` passes
- [x] `mf-specs check --name montflow-references-plugin` reports zero issues
