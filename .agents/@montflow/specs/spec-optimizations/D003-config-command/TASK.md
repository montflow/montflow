---
id: D003
name: config-command
type: execution
originator: user
size: medium
depends-on: C003, D002
related-tasks:
status: complete
---

# Task D003: config-command

## Type: execution

## Description

Wire `spec-sizing` into the same surfaces as `author` and `execute`. The binary
renders the prompt for a fixed or open scope, the host tool and slash form
dispatch the same executor, and doctor owns the third prompt file so drift fails
before an agent acts on stale guidance. The command writes no config itself.

## Requirements

- Add `mf-specs sizing-config [--scope repo|spec|phase] [--name <spec>] [--phase <id>] [--mode guided|autonomous] [--focus <text>]`.
  Load `spec-sizing` through the shared prompt loader, gate on doctor, render,
  and print. It writes no file and dispatches no session.
- Derive the scope mechanically and put it in the prompt, but leave it open when
  the caller supplied no scope: no flags means `scope` is empty and the prompt
  asks. `--name` alone implies spec, `--name` plus `--phase` implies phase, and
  `--scope` wins over the implication.
- Reject inconsistent scope input with a usage diagnostic that names the problem
  and the corrected command: `--phase` without `--name`, `--scope spec|phase`
  without `--name`, `--scope phase` without `--phase`, a `--scope` that
  contradicts `--name` or `--phase`, and an empty `--name` treated as absent.
- Accept exactly `guided` and `autonomous` for `--mode`, default `guided`, reject
  every other value, and pass the internal `unsupervised` flag to the template.
  Reuse C002's mode handling rather than copying it.
- Add the host tool `spec_sizing` and the slash form `/specs sizing-config`,
  both dispatching through the same executor as `author` and `execute`. The tool
  accepts the same optional scope/name/phase/mode/focus inputs and rejects the
  same conflicts. No copied prompt loading or child-run implementation. Update
  `COMMAND_DESCRIPTION` with the new verb, the optional scope flags, and the
  open-scope behaviour.
- Extend doctor's owned set to `spec-sizing.json`: install it when missing,
  repair it to the package bytes when stale, and under `--check` report
  `missing` / `stale` per file without writing. A missing or stale prompt fails
  `sizing-config` before rendering with a coded diagnostic naming the path and
  the doctor command, and `mf:check:specs` fails on the drift.
- Update the doctor docs and any prose that says it owns exactly two prompts,
  including `packages/specs/src/apps/cli/CONTEXT.md` and the package README
  section that lists the shipped spec prompts.
- Tests cover the open scope, every fixed scope, each conflict above, an empty
  `--name`, an invalid mode, the missing and stale prompt gate with code, path,
  and fix, the slash form, the host tool registration, the rendered prompt for
  open, repo, spec, and phase scope, and a run that writes no file.
- Keep `author`, `execute`, `which`, and the existing doctor behaviour working
  unchanged.

## Completion

- [ ] Bare `sizing-config` prints the open-scope prompt; `--scope repo`, `--name`, and `--name --phase` print their fixed scopes
- [ ] `--phase` without `--name`, `--scope phase` without `--phase`, and a contradictory `--scope` all exit non-zero and name the fix
- [ ] `--mode nope` fails; `autonomous` renders the unsupervised branch
- [ ] `doctor --check` reports `spec-sizing.json` missing/stale and writes nothing
- [ ] `mf:check:specs` fails on a stale `spec-sizing.json`
- [ ] `/specs sizing-config` and `spec_sizing` dispatch the same rendered prompt
- [ ] `bun run --cwd packages/specs test`, `lint:check`, `format:check`, and `ts:check` pass
