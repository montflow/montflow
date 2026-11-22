# Memory

## Context

A002 wires `--ref`, `--latest`, and `--wizard` into `mf-references update` on
both the binary (`binary.apps.module.ts`) and slash (`slash.apps.module.ts`),
routes through the engines into A001's lifecycle surface, adds the interactive
wizard module, and prints the `REFERENCE.md` diff from A001's `ReferenceDiff`.

## Progress

- `update-wizard/` module added: `isInteractive`, `describeCommit`,
  `parseCommitCandidate`, `runWizard` (specific-commit vs latest), with injected
  `WizardOutput`/`WizardInput` seams for headless tests.
- Engines: `UpdateOptions` gains `ref`/`latest`; `update` and `updateAll` pass
  them through; new `updateWizard` engine runs the prompt (TTY-gated, io
  injectable) then calls `update` with the chosen target.
- Binary `update`: `--ref` (string), `--latest`, `--wizard` flags; mutual
  exclusivity; `--wizard --all` usage error; `--ref`/`--latest --all` apply to
  every entry; auto-wizard when stdin is a TTY and no target flag given.
- Slash `update`: same flags via `withFlags`; same exclusivity/all checks.
- Renderers: `updated` prints the `REFERENCE.md` diff (`-ref:`/`+ref:`) from
  `entryDiff` in both agent and human modes.

## Findings

- `ts:check` clean; full CLI suite passes (128 tests).
- New engine tests: `--ref` pins + `--latest` removes; latest fast-forwards;
  wizard latest path; wizard commit path resolves + shows metadata; wizard
  refuses unresolvable hash; wizard usage error when not a TTY.
- New slash parse tests cover the three flags, mutual exclusivity, and
  `--wizard --all`. New renderer tests cover the diff output.

## Gates

- A002 GATES Stage 0 command runs the `src/apps/cli` suite; 128 tests pass.

## Open Questions

- None.

## Handoff

- A003 reviews phase A end to end.

## Deviations

- None.

## Execution

- Read: phase MEMORY Execution Brief, TASK.md/GATES.md, scoped source.
- Write scope: TASK.md files only.
- Record: MEMORY.md at or under 80 lines; logs at /tmp/A002-wire-cli-flags-and-wizard.log.