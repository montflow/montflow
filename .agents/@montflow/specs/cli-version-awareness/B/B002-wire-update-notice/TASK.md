---
id: B002
name: wire-update-notice
type: execution
originator: user
depends-on: B001
related-tasks:
status: complete
---

# Task B002: wire-update-notice

## Type: execution

## Description

Every `mf-*` CLI prints one actionable line to stderr when the cached verdict says it is out of date, pointing at the update guide — without changing behaviour or exit codes.

## Requirements

- One shared entry-point runner in `@montflow/version`, so each of the five `main.ts` files changes by one line instead of carrying its own copy of the logic.
- The notice is one plain-text line on stderr, with no colour codes, and never appears for `--version`, `version`, `--help`, or `--completions`.
- The message names the installed version, the available version, the checkout path, and the guide anchor for that CLI (`guides/updating.md#<cli>`).
- No command's exit code changes because the CLI is stale; a successful command still exits 0 and a failing one keeps its own code.
- The notice prints at most once per invocation and the cache limits it to at most once per 24 hours per checkout.
- Tests assert the notice appears when stale, stays silent when current or unknown, leaves stdout byte-identical, and leaves exit codes untouched.

## Completion

- [ ] Done.
