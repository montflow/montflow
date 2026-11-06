---
id: H004
name: wire-author-entrypoints
type: execution
originator: user
size: tiny
depends-on: H003
related-tasks:
status: complete
write-scope: packages/specs
---

# Task H004: wire the author entry points

## Type: execution

## Description

The rewritten prompt is only reachable from the CLI and host if their author
surfaces can supply the new answers. Wire `mf-specs author`, `/specs author`,
and `spec_author` to the same five variables, with validation and hidden-branch
behaviour identical to the `/mf-prompts` fill.

## Requirements

- Add `--rigor`, `--isolated`, `--origin`, `--origin-branch`, and
  `--worktree-name` to `mf-specs author`; add the same fields to the
  `spec_author` tool input and the `/specs author` slash flag table. Keep
  `--request` and `--notes` unchanged.
- Pass only the supplied and visible values to the prompt loader. A hidden
  value is never required and never rendered; `origin-branch` is required only
  when `origin` is `other`; `worktree-name` is required only when `isolated` is
  `yes`.
- Validate every supplied value against its kind: rigor one of the five,
  isolated `yes`/`no`, origin `current`/`main`/`other`, a kebab-case worktree
  name, and a non-empty freeform origin branch. A refusal names the flag, the
  accepted values, the actual value, and the exact rerun.
- Keep the binary model-free: it renders the prompt and prints it; it never
  creates a worktree or changes a branch. The prompt remains the only place the
  worktree recipe lives.
- Tests cover each flag reaching the template, the hidden combinations, every
  refusal, `spec_author` parity, and slash-command parity. The `/mf-prompts`
  path needs no new flags and must render the same text for the same answers.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [x] Every new flag reaches the rendered prompt with the same value the fill flow would use
- [x] A hidden flag is not required and does not render
- [x] `origin-branch` is required only for `origin: other`; `worktree-name` only for `isolated: yes`
- [x] Each invalid value fails with a coded message naming the flag and its accepted values
- [x] `spec_author` and `/specs author` accept the same inputs as the binary
- [x] The binary performs no git mutation
