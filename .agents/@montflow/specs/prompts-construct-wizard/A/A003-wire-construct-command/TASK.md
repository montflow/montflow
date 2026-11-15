---
id: A003
name: wire-construct-command
type: execution
originator: user
size: large
depends-on: A001, A002
write-scope: packages/prompts/src/apps/cli/,packages/prompts/README.md,guides/
related-tasks:
status: complete
---

# Task A003: wire-construct-command

## Type: execution

## Description

Wire the `construct` command into the `mf-prompts` binary and the
`/mf-prompts` slash command, remove the two overlapping `render` and
`execute` commands, add `--wizard` and `--copy` flags, and update the help
text, documentation, and CLI tests to describe the single construct operation.

## Requirements

- The binary (`packages/prompts/src/apps/cli/binary.apps.module.ts`) exposes a
  `construct` command: `construct <prompt-name> [key=value ...]`, plus
  `--wizard` and `--copy` boolean flags; the handler calls the shared
  `construct` engine (A001), prints the rendered text to stdout, and sets a
  non-zero exit on a refusal through the existing `report`/`exitFailed` path.
- `construct --wizard` (with or without a name) dispatches the A002 wizard flow
  and prints its result; `construct` with `key=value` stays non-interactive for
  scripting and CI. `--copy` places the constructed output on the system
  clipboard as well as printing it (nice to have).
- The `render` and `execute` commands are removed from the binary, and their
  CLI help, USAGE, and the slash-command `COMMAND_DESCRIPTION`/`USAGE` describe
  only the single `construct` operation and its wizard mode. The `--model` flag
  and the `execute`-only `plan` invocation strings are dropped from the CLI
  surface.
- The `/mf-prompts` slash parser (`slash.apps.module.ts`) accepts `construct`
  (with `key=value`, `--wizard`, `--copy`) and no longer parses `render` or
  `execute`; its `run` dispatches through the shared engines and the wizard.
- Documentation — `packages/prompts/README.md` and any prompt CLI page under
  `guides/` that names `render`/`execute` — is updated to describe `construct`
  and `--wizard`, and no shipped document promises a `render` or `execute`
  command that no longer exists.
- CLI tests in `packages/prompts/src/apps/cli/tests/` cover: `construct`
  rendering a supplied prompt, `construct` failing on a missing required value,
  `construct` with no model succeeding, `--wizard` reaching the wizard flow,
  `--copy`, and the removal of the `render`/`execute` command names.
- Package tests, `mf:check`, lint, format, and typecheck stay green for
  `packages/prompts`.

## Execution

Read the phase `A/MEMORY.md` `## Execution Brief` and this task's `GATES.md`;
write only within `packages/prompts/src/apps/cli/`,
`packages/prompts/README.md`, and `guides/` plus this task's records.

## Completion

- [x] Done.