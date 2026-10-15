# Memory

## Context

A003 gives the pi-specs verification vocabulary a **severity channel**: an
`Issue` can be an advisory `warning` instead of a fatal `error`, warnings never
flip a `Result` to invalid, and `check` / the slash form gain `--strict` to
promote them. Scope was `packages/pi-specs/**` only; `pi-profiles` and
`pi-prompts` were read (read-only) for the `fix`/`line` shape and were being
edited concurrently by another worker (A004). Dependency findings came from
`A001-explore-verification-surface/MEMORY.md` — in particular that `Issue` had
no severity/`fix`/`line`, that `pi-prompts`' `VerifyIssue` already carries
`fix`/`line` (`prompts.module.ts:327-334`) and renders `Fix:` lines
(`verifyReport` `:604-608`), and that `runCheck` does not exist.

## Progress

- 2026-10-15: complete

## Findings

### Design

- `Issue` gained `severity?: 'error' | 'warning'`, `fix?: string`, `line?:
  number`. An **absent** severity reads as `error` via `severityOf`, so every
  error issue still serializes as `{ field, message }` and every pre-existing
  `toStrictEqual` assertion and verdict is byte-identical.
- New factories: `issue(field, message, fix?, line?)` (error) and
  `warning(field, message, fix?, line?)` (advisory). New pure helpers:
  `severityOf`, `isError`, `isWarning`, `errorCount`, `warningCount`,
  `noErrors`, `promoteWarnings`.
- `Result.valid` now means "zero error-severity findings": all six file/tree
  producers plus `structure` compute `valid: noErrors(issues)` instead of
  `issues.length === 0`. With no warning producers yet, this is
  behavior-identical.
- `structure.nest` now spreads the nested finding (`{ ...found, field:
  `${path}: ${field}` }`) so severity/`fix`/`line` survive aggregation; the old
  `issue(...)` call dropped them.
- CLI: `reduceCheck(root, entries, strict)` is the pure reducer `check` now
  delegates to; it applies `promoteWarnings` first under `strict`, then computes
  `failed`/`issueCount` (errors) and the new `warningCount`. `checkExitCode`
  returns `1` iff `failed > 0`. `check` threads `options.strict`.
- Rendering: warnings get a `!` mark and are counted apart from issues in
  `renderCheck` (line `! field: msg`, `(1 issue · 1 warning)`, summary
  `… · N warnings`), `renderStatus` (`verify ✓ verified · 1 warning` plus marked
  lines), and `renderList` (` · ! 1 warning`). Any issue with a `fix` also
  renders an indented `Fix: …` line, mirroring pi-prompts. Error-only output is
  unchanged (warning suffix suppressed at zero warnings), so existing render
  snapshots still pass.
- Strict flag: `--strict` on `checkCommand` and parsed by the slash parser
  (`--strict`); `runSlash('check --strict …')` passes it through `CheckOptions`.
- `lifecycle.analyze` maps `!result.valid` to `inconsistent`; because `valid`
  now ignores warnings, a warning-only lifecycle result will **not** read as
  `inconsistent` (resolves A001's open question). No producer emits a warning
  yet, so nothing observable changed.

### Files changed

- `packages/pi-specs/src/modules/verify/verify.module.ts` — `Severity`, added
  `Issue.severity`/`fix`/`line`, `warning`, `severityOf`, `isError`/`isWarning`,
  `errorCount`/`warningCount`, `noErrors`, `promoteWarnings`; `issue` gains
  optional `fix`/`line`; `infoLine` is warning-aware.
- `packages/pi-specs/src/modules/verify/CONTEXT.md` — records the severity
  vocabulary as belonging here and failure policy (`--strict`) as CLI-level.
- `packages/pi-specs/src/modules/verify/tests/verify.test.ts` — new cases:
  default-to-error (and that `issue` still equals `{field,message}`), `fix`/`line`
  carriage, warning is advisory (`noErrors` true, counts), `promoteWarnings`,
  and the warning `infoLine`.
- `packages/pi-specs/src/modules/spec/spec.module.ts`,
  `.../task/task.module.ts`, `.../gates/gates.module.ts`,
  `.../memory/memory.module.ts`, `.../lifecycle/lifecycle.module.ts`,
  `.../review-link/review-link.module.ts` — `valid: noErrors(issues)`.
- `packages/pi-specs/src/modules/structure/structure.module.ts` — `nest`
  preserves severity/`fix`/`line`; `valid: noErrors(issues)`.
- `packages/pi-specs/src/apps/cli/cli.apps.module.ts` — `CheckReport.warningCount`,
  `CheckOptions.strict`, `CheckEntry`, `reduceCheck`, `checkExitCode`; `check`
  delegates + threads strict; warning-aware `renderCheck`/`renderStatus`/
  `renderList`; `--strict` on `checkCommand`; slash `strict` parse + plumbing.
- `packages/pi-specs/src/apps/cli/tests/check.test.ts` — new cases:
  default-to-error fails, warnings-alone do not fail (exit 0), strict promotes
  (exit 1), and `renderCheck` warning marks/counts/`Fix:`.
- `packages/pi-specs/src/apps/cli/tests/status.test.ts` — `renderStatus`
  verified-with-warning rendering.
- `packages/pi-specs/src/apps/cli/tests/list.test.ts` — `renderList` warning
  rendering.
- `packages/pi-specs/src/apps/cli/tests/run-slash.test.ts` — slash `--strict`
  accepted on a clean spec, still fails a broken one.
- `packages/pi-specs/src/extension.ts` — slash help text lists
  `check … [--strict]`.

### Gate outputs (verbatim)

`bun run --cwd packages/pi-specs test`:
```
 Test Files  52 passed (52)
      Tests  326 passed (326)
Type Errors  no errors
   Start at  12:37:38
   Duration  1.96s (import 83%, transform 10%, typecheck 3%, tests 3%, worker 1%)
```

`bun run verify:montflow:specs`:
```
$ bun run --cwd packages/pi-specs cli check --dir $PWD
$ bun run src/apps/cli/main.ts check --dir /home/daniel/dev/montflow/opencode-migration
4 specs · 0 failed · 0 issues
```

`bun run --cwd packages/pi-specs ts:check`:
```
$ tsc --noEmit
```

`bun run --cwd packages/pi-specs lint:check`:
```
Found 0 warnings and 0 errors.
Finished in 487ms on 68 files with 138 rules using 16 threads.
```

`bun run --cwd packages/pi-specs format:check`:
```
Checking formatting...

All matched files use the correct format.
Finished in 425ms on 122 files using 16 threads.
```

Actual binary on the throwaway fixture (`/tmp/opencode/a003-severity`), strict
flag accepted with no warnings present:
```
$ bun run --cwd packages/pi-specs cli check --dir /tmp/opencode/a003-severity --verbose --strict
root /tmp/opencode/a003-severity/.agents/@montflow/specs
✓ mock-warn

1 spec · 0 failed · 0 issues
EXIT=0
```

Synthetic-warning reproduction — same fixture, one injected `warning('metrics',
…)`, driving the real `verifySpecTree` → `reduceCheck` → `renderCheck` →
`checkExitCode` path (`/tmp/opencode/a003-severity/warn-proof.ts`):

Without `--strict`:
```
$ bun /tmp/opencode/a003-severity/warn-proof.ts
✓ mock-warn (1 warning)
  ! metrics: No metrics recorded.
    Fix: Add a `## Metrics` section.

1 spec · 0 failed · 0 issues · 1 warning
EXIT=0
```

With `--strict`:
```
$ bun /tmp/opencode/a003-severity/warn-proof.ts --strict
✗ mock-warn (1)
  metrics: No metrics recorded.
    Fix: Add a `## Metrics` section.

1 spec · 1 failed · 1 issue
EXIT=1
```

### Checkbox status (TASK.md / GATES.md left untouched)

`## Completion`: all four met — tests pass with new default-to-error /
warn-does-not-fail / strict-promotes cases; `verify:montflow:specs` zero issues;
synthetic warning proven non-fatal then fatal by an actual run; `ts:check` /
`lint:check` / `format:check` pass.

`GATES.md` Stage 0: severity defaults to error (absences read as error, all
producers unchanged in verdicts); strict accepted by binary and slash. Stage 1:
warning-only result is valid with exit 0; same result under strict is invalid
with exit 1; every spec verifies with zero issues.

## Open Questions

- Should slash `status`/`state`/`next` also honor `--strict`? A003 only wires it
  to `check` (binary and slash `check`), so `--strict` on the other subcommands
  is parsed and ignored. Parked for A004 / the orchestrator.
- The warning mark is the ASCII `!` (to stay token-lean with `✓`/`✗`/`•`/`○`).
  If later warning producers (e.g. C001 version drift) want a distinct glyph,
  it is a one-line change in `renderCheck`/`renderStatus`/`renderList`.

## Handoff

- A004 (and any later warning producer) should use
  `warning(field, message, fix?, line?)` from `@montflow/pi-specs`'s verify
  module and route results through `reduceCheck(..., strict)`; `promoteWarnings`
  and `noErrors` are the primitives. pi-profiles/pi-prompts have their own
  `VerifyIssue`/`VerifyResult`; mirror the same severity + `--strict` promotion
  there.
- `--strict` exists only on `check` and slash `check`. `renderStatus`/
  `renderList` already render warnings even without strict.
- Error issues are still `{ field, message }` when no `fix`/`line` is passed, so
  downstream `toStrictEqual` style assertions keep working.

## Deviations

- The gate asked for "an ACTUAL run" of a synthetic warning. No pi-specs
  verifier emits warnings yet (that is A004 in another package and C001's
  version drift), so the run is a throwaway script that injects one `warning`
  and drives the **real** `verifySpecTree` → `reduceCheck` → `renderCheck` →
  `checkExitCode` pipeline against a real fixture. The real `mf-specs` binary
  was also run on the fixture to show `--strict` parses and the clean path is
  unchanged. This is as close to the CLI as possible without adding a product
  warning rule, which would duplicate A004/C001.
- "both existing specs" is now four spec directories under
  `.agents/@montflow/specs`; all four verify at zero issues.
