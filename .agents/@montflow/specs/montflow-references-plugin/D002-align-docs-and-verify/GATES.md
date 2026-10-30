# GATES

## Stage 0: Docs

- [ ] README lists `@montflow/references` and its two skills
- [ ] INSTALL lists the plugin and its install command
- [ ] AGENTS lists the `mf:check:references` scope
- [ ] the CLI guide lists the new verbs and the `--human` / `--verbose` convention

## Stage 1: Verification

- [ ] `bun run mf:check` passes
- [ ] `bun run mf:gate:fast` passes
- [ ] `bun run --cwd packages/references test` passes
- [ ] `mf-specs check --name montflow-references-plugin` reports zero issues
