# Memory

## Context

- B002 wires the B001 `sync` engine into both `mf-skills` front ends. The engine
  is untouched; every domain rule (classification, outcomes, drift, refusal
  text, copying) stays in `../sync`.
- Both surfaces render only through `Renderers.sync`, so parity is structural
  rather than tested twice.

## Progress

- `packages/skills/src/apps/cli/renderers.apps.module.ts` — added `sync(result,
  { verbose })`, the single report renderer:
  - one line per skill: `<mark> <name>: <outcome>`, marks `+` added, `~` updated,
    `=` unchanged, `-` skipped; a skip prints `skipped (internal)`
  - `--verbose` adds one indented line per file (`  <file>: <outcome>`) from
    `SyncSkillStatus.files`; nothing else changes
  - footer: `<n> skills · <n> added · …` then a verdict that agrees with the exit
    code — `✓ current.`, `+ <n> skills synced.` (wrote), `✗ drift — <n> skills
    would change.` (check)
- `binary.apps.module.ts` — `syncCommand` with `--from`, `--dir`, `--check`,
  `--verbose`, appended to `rootCommand`; defaults `--dir` to `process.cwd()`,
  leaves `--from` undefined so the engine resolves the checkout, passes
  `invocation: 'mf-skills sync'`, and calls `exitFailed` when
  `result.check && result.drifted`.
- `slash.apps.module.ts` — `Sync` action in `CliAction`, `KNOWN_SYNC_FLAGS`,
  a `sync` parse case (unknown flag **or** stray positional is `Help`), `sync`
  in `COMMAND_DESCRIPTION`, `USAGE`, and the `run` switch. `run` passes
  `dir: action.dir ?? cwd`, keeps the default `/mf-skills sync` invocation,
  notifies the report once, then fails with a short "run /mf-skills sync" message
  on check drift.
- `cli/CONTEXT.md` — recorded that sync domain rules live in `../sync`.
- No new tests (B003 owns the CLI-boundary suite); verified by manual smoke.

### Smoke evidence

Temp checkout (`alpha` + `CHANGELOG.md`, `beta`, internal `secret`) into an empty
target:

```
# first run — exit 0
+ alpha: added
+ beta: added
- secret: skipped (internal)
3 skills · 2 added · 1 skipped
+ 2 skills synced.

# second run — exit 0
= alpha: unchanged
= beta: unchanged
- secret: skipped (internal)
3 skills · 2 unchanged · 1 skipped
✓ current.

# --verbose — exit 0
= alpha: unchanged
  CHANGELOG.md: unchanged
  SKILL.md: unchanged
= beta: unchanged
  SKILL.md: unchanged
- secret: skipped (internal)
3 skills · 2 unchanged · 1 skipped
✓ current.

# --check after mutating beta's SKILL.md — exit 1, target unchanged
= alpha: unchanged
~ beta: updated
- secret: skipped (internal)
3 skills · 1 updated · 1 unchanged · 1 skipped
✗ drift — 1 skill would change.
```

- Real checkout (`--dir` temp target): 46 skills, first run `45 added · 1
  skipped` (`syncing-skills`), re-run `45 unchanged · 1 skipped`, `--check`
  clean exit 0, drift exit 1, `--from=`/`--dir=` forms accepted.
- Slash vs binary: `diff` empty for `--check`, `--verbose`, and the fixture's
  `--check --verbose`; slash drift notifies once and fails once; slash unknown
  flag and stray positional both return `Help` (usage).
- `cli sync --help` lists all four flags, exit 0; `cli --help` lists `sync`.
- Verified green: `bun run --cwd packages/skills test` (42 files / 269 tests),
  `format:check`, `lint:check`, `ts:check`, `bun run mf:check:skills`.

## Open Questions

- None.

## Handoff

- B003 can test parity by building a fixture store, running
  `Sync.runSync(...)` + `Renderers.sync(result, { verbose })` against
  `Slash.run('sync …', ui, cwd)`, and asserting the notify text equals the
  rendered report. Binary exits are observable through `process.exitCode` after
  running `Command.run(rootCommand, …)`.
- The report contract B003 should pin: marks `+ ~ = -`, `skipped (internal)`,
  footer `N skills · …` plus one verdict line, verbose file lines indented two
  spaces. Check drift exits 1; a non-check run that wrote changes exits 0.
- B004 docs: no shipped doc yet quotes the report lines; the guide only names
  the outcomes, which the renderer matches.

## Deviations

- **Non-check clean-run exit code.** The drift gate is `result.check &&
  result.drifted`, so a normal run that synced changes exits 0 (the guide pipes
  `sync` then `--check`; failing a successful write would break that flow).
- **Slash rejects stray positionals.** `sync extra` is usage, matching the
  binary, which has no positional for `sync`. `doctor` keeps its older
  ignore-positionals behaviour; only `sync` is strict.
- **Slash drift failure does not repeat the report.** `verify` fails with the
  render again; `sync` notifies the report and fails with one actionable line,
  per the task's "an agent sees the report once".
- **Report format is new.** B001 defined no text contract, so the per-skill
  marks, footer, and verdict strings above are B002's; B003 should pin them.
- **No tests added here**, by instruction: B003 owns `cli/tests/` coverage.
