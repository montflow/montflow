# Memory

## Context

Wire the `construct` command into the `mf-prompts` binary and the `/mf-prompts`
slash command, remove the two overlapping `render`/`execute` commands, add
`--wizard`/`--copy`, and update help, docs, and CLI tests to describe the single
construct operation.

## Progress

- complete

## Findings

- `engines.construct(scope, name, values, { invocation })` added (model-free,
  via `PromptExecute.construct`). `render`/`plan` engines kept for the
  interactive surface.
- Binary (`binary.apps.module.ts`): `execute`/`render` commands removed; a
  `construct` command with optional `name`, `--wizard`, `--copy` added. Non-wizard
  path calls `engines.construct`; `--wizard` dispatches `Interactive.constructWizard`
  with `interactive: process.stdout.isTTY === true` (non-TTY → `NON_TTY_MESSAGE`).
  `--copy` shells out to a clipboard tool from the composition root. Provides
  `PromptStore` + `ProfileStore` via a combined layer.
- Slash (`slash.apps.module.ts`): `execute`/`render` removed from
  `parseCliArgs`/`run`; `Construct` action added with `--wizard`/`--copy`. Slash
  `--wizard` is notify-only so it refuses with `NON_TTY_MESSAGE`. `run`'s
  executor port is retained as `_execute` for call-site stability.
- Docs: README now describes `construct`/`--wizard`/`--copy`; no `render`/
  `execute` command promised. `guides/` has no render/execute references.
- Tests: old `execute.test.ts` (testing removed commands) replaced by
  `construct.test.ts` (construct render, missing-required, no-model, `--wizard`
  refusal, `--copy`, conditional/confirm, and command-name removal). Package
  suite, typecheck, lint, and format are green.
- Note: the interactive menu (`apps/interactive`) still exposes `render`/
  `execute` menu actions; removing those is outside A003's write-scope.

## Gates

- A003 official gate stage 0 (mechanical) passed once via `gate run`
  (fingerprint 353007e5…, exit 0).

## Open Questions

- None.

## Handoff

- A004 reviews phase A end to end.

## Deviations

- `packages/prompts/package.json` gained `@montflow/profiles` and `src/server.ts`
  imports `ProfileStore`; both are required wiring for the wizard's profile store,
  slightly outside the task write-scopes but necessary for a green build.