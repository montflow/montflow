---
id: A002
name: wire-cli-flags-and-wizard
type: execution
originator: user
size: medium
depends-on: A001
write-scope: packages/references/src/apps/cli/binary.apps.module.ts,packages/references/src/apps/cli/slash.apps.module.ts,packages/references/src/apps/cli/engines.apps.module.ts,packages/references/src/apps/cli/renderers.apps.module.ts,packages/references/src/apps/cli/index.ts,packages/references/src/apps/cli/tests/,packages/references/src/apps/cli/update-wizard/
related-tasks: A001
status: pending
---

# Task A002: wire-cli-flags-and-wizard

## Type: execution

## Description

Wire the `--ref <commit|tag|branch>`, `--latest`, and `--wizard` flags into the
`update` command on both the `mf-references` binary (`binary.apps.module.ts`)
and the `/mf-references` slash command (`slash.apps.module.ts`), routing through
the engine (`engines.apps.module.ts`) into the new lifecycle surface A001
provides. Update the renderer so an `update --ref`/`--latest` run prints the
`REFERENCE.md` change as a diff. Add the interactive wizard: when `--wizard` is
passed, or when `update <name>` runs with no target flag in a TTY, the CLI
prompts for the choice (specific commit or latest), resolves a commit hash
against the remote, shows the commit subject and date, and states when `--force`
would be needed, then invokes `update` with the chosen target.

The wizard is a new module under `packages/references/src/apps/cli/update-wizard/`
that owns the interactive prompt (TTY detection and stdin reading) and the
commit-metadata display. It consumes the lifecycle helpers A001 added. The
binary and slash surfaces share the wizard through the engine adapter, keeping
binary and slash from drifting.

## Requirements

- The `update` command on the binary gains `--ref <ref>` (string), `--latest` (boolean), and `--wizard` (boolean) flags, alongside the existing `--all`, `--force`, `--human`, `--verbose`, and `--dir`.
- The `/mf-references` slash command's `update` action parses the same three flags; the flag sets match the binary.
- `--ref`, `--latest`, and `--wizard` are mutually exclusive; passing more than one is a usage error.
- `--wizard --all` is a usage error; the wizard prompts for one entry at a time.
- `--ref` and `--latest` with `--all` apply the same target to every entry.
- A `--ref`/`--latest`/`--wizard` update routes the chosen target into the A001 lifecycle surface and renders the `REFERENCE.md` change as a diff, leaving it uncommitted.
- When `--wizard` is passed, or when `update <name>` runs with no target flag and stdin is a TTY, the CLI runs the wizard. When stdin is not a TTY and no target flag is given, `update` keeps today's behaviour (refresh to the committed `ref:` or track the branch).
- The wizard's "specific commit" path prompts for a full or abbreviated commit hash, resolves it against the remote, shows the commit subject and date before writing, and confirms before running `update`.
- The wizard's "latest on the tracked branch" path shows the branch and current head commit, then runs `update --latest`.
- The wizard states when the run would need `--force` (a dirty clone).
- Every verb stays agent-first: the default output is compact and parseable; `--human` adds readable prose. The wizard prompt path is an interactive exception only when stdin is a TTY.
- New binary, slash, engine, renderer, and wizard code carries tests in the `packages/references/src/apps/cli/tests/` directory.

## Completion

- [ ] `update` on binary and slash accepts `--ref`, `--latest`, and `--wizard`, mutually exclusive.
- [ ] A `--ref`/`--latest`/`--wizard` update prints the `REFERENCE.md` diff and leaves it uncommitted.
- [ ] `--wizard` (or TTY with no target flag) prompts for specific-commit or latest, shows subject/date before writing, and states when `--force` is needed.
- [ ] `--wizard --all` is a usage error.
- [ ] Non-TTY `update <name>` with no target flag keeps today's behaviour.
- [ ] The wizard prompt and metadata display are separable for headless tests.
- [ ] New binary/slash/engine/renderer/wizard tests pass.