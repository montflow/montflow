# Memory

## Context

B003 adds CLI-boundary tests for `sync` after B001 (engine) and B002 (binary +
slash front ends). Engine behavior is already covered by
`src/apps/sync/tests/sync.test.ts`; this task proves the surfaces agree.

## Progress

- Added `packages/skills/src/apps/cli/tests/sync.test.ts` (11 tests):
  - `Renderers.sync`: all four outcome lines + footer; verbose file lines.
  - Slash end to end: copies `SKILL.md` + `CHANGELOG.md`, never copies an
    internal skill; second run reports `unchanged` and leaves the store
    byte-identical; `--check` reports `updated`, fails, and writes nothing.
  - Real binary via `spawnSync('bun', ['run', 'src/apps/cli/main.ts', ...])`:
    exit 0 on a clean run, exit 1 on `--check` drift (target bytes unchanged),
    exit 0 once current, non-zero on `--bogus` with nothing copied.
  - Parity: binary `--check --verbose` stdout === slash `ui.notify` text;
    `parseCliArgs` parses all four flags in both `--flag value` and
    `--flag=value` forms, unknown flag → `Help`.
- Teeth checked by temporary mutations (both reverted, no source change left):
  dropping the `!check` write guard fails the two no-write tests; making the
  binary ignore `--verbose` fails the parity test.
- Verification: package `test` (291 tests), `format:check`, `lint:check`,
  `ts:check`, and `mf:check:skills` all green.

## Open Questions

- None.

## Handoff

- B004 (conformance + changelogs) can proceed; no engine or front-end behavior
  changed.

## Deviations

- Spawn tests use `cwd` resolved from `import.meta.dirname` (the package root)
  instead of literal `process.cwd()`. It is the same directory under the
  documented `bun run --cwd packages/skills test` invocation and stays correct
  if vitest is launched with a different cwd.
