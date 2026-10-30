# Memory

## Context

A002 wires all five `mf-*` binaries to `@montflow/version`: one shared runner
resolves the package identity, attaches a `version` subcommand, and runs the
command tree. The hardcoded `VERSION = '0.0.1'` constants (and `mf-specs`'s
literal in `Command.run`) are gone.

Decisions:

- `Cli.run({ packageRoot, command })` is the one entry point. Each `main.ts`
  passes `${import.meta.dirname}/../../..`, so the version comes from that
  CLI's own manifest.
- `effect/cli`'s `withSubcommands` replaces dispatch when applied twice, and
  re-registering a root's subcommands would bypass the root's
  `Command.provide(...)` layers. So the runner does **not** inject the
  `version` command: `Cli.versionCommand({ packageRoot })` is registered by
  each package in its own command tree, where its providers stay in force.
  `Cli.run` resolves identity only for `--version` and runs the tree.
- `version --json` prints one object on stdout. Absent git facts and an absent
  store are omitted, matching A001's shape; human output prints `unknown` for
  those fields so a reader sees the field exists.
- Store version comes from `.agents/skills/.montflow-sync.json` (the D001
  schema), read through the new `Store` module. A store directory with no
  manifest reports `unmanaged`; no store means no `store` line.
- `--dir` selects the workspace root for store lookup, matching the other CLIs;
  the default is the process working directory.
- `--version` is still `effect/cli`'s built-in and prints `mf-<cli> v<version>`,
  the same value `version` reports.

## Progress

- complete: modules `store` and `cli` added; five `main.ts` files rewired;
  `version` registered in each package's command tree; `VERSION` constants
  removed.
- Tests: render forms and store states in `cli/tests/render.test.ts`; a spawned
  five-binary invariant in `cli/tests/five-clis.test.ts` asserting each reported
  version equals its own `package.json`.
- Verified: `turbo ts:check`, `turbo lint:check`, `turbo test`, and
  `turbo format:check` scoped to `@montflow/version` plus the five CLIs — all
  green (skills 417, version 28, specs 408, prompts 559, profiles 144, reviews
  160).

## Open Questions

- None.

## Handoff

- B002 extends `Cli.run` with the stale notice; the five `main.ts` files should
  not need to change again.

## Deviations

- The "one shared entry-point runner" that B002 describes is introduced here so
  the five binaries are not rewritten twice. B002 adds notice behaviour inside
  the runner; its diff in `main.ts` is therefore empty rather than one line.
