# Changelog

## [3.3.1]

### Fixed

- `execute` now refuses a prompt that fails `verify`, not just one whose template will not parse. A template referencing an undeclared variable used to render anyway and substitute nothing, so a run silently lost the value the author expected
- The skill no longer claims `render` and `execute` behave identically: `render` deliberately skips verification so a broken file can be inspected, and that difference is now stated

## [3.3.0]

### Changed

- The headless CLI slash command is now `/mf-prompts`, matching the binary. The `-cli` suffix is gone: one word means one thing in both runtimes
- The interactive menu is now `/mf-prompts-tui`, so the plain name belongs to the CLI. The menu's description points at `/mf-prompts` and vice versa

### Fixed

- `doctor`'s fix line and the `execute` gate message follow the rename, so every suggestion is typeable as written

## [3.2.1]

### Fixed

- A `--compile`d binary now installs and verifies the packaged skills. The payload is embedded in the bundle (`bun run generate:payload`, run automatically by `build:cli`), so `doctor` and `execute` work with no package checkout present — previously the skills gate always reported the payload missing and blocked every execution
- `doctor`'s own fix line names the caller: `mf-prompts doctor` from the binary, `/mf-prompts-cli doctor` from the slash command, via a threaded `invocation`

### Added

- `EMBEDDED_SKILL_PAYLOAD`, generated from `skills/` and checked in
- A test asserting the embed matches `skills/` byte for byte, so a stale embed fails the suite instead of shipping
- Tests for the fallback: a missing package directory still resolves the payload, and a tree installed from the embed verifies as current and repairs when edited

## [3.2.0]

### Added

- `mf-prompts` binary: `bin` + `main.ts`, built by Bun (`bun build --compile`) with `effect/unstable/cli` inside. Ten subcommands, real exit codes, no Pi session needed
- Step 0 in the pipeline, choosing between the binary and the slash command, and saying which to prefer and why
- `list --verbose` and `verify --verbose`, under a stated token contract

### Changed

- The primary command form is now `mf-prompts …`; `/mf-prompts-cli …` is documented as the in-Pi alternative
- The binary's `execute` validates, renders, and prints what _would_ be sent rather than running a prompt — a model runtime lives in the Pi extension. The slash command and `prompt_execute` still run it
- Refusal text names the front end it came from (`mf-prompts execute` vs `/mf-prompts-cli execute`) via a threaded `invocation`, so the fix-it advice is always typeable
- `doctor` no longer claims a slash command has an exit code

### Known limitation

- (Resolved in 3.2.1 — the earlier 3.2.0 note that a compiled binary could not
  run `doctor` or `execute` no longer applies.)

## [3.1.0]

### Fixed

- `inspect` sample: the documented output did not match what the command prints. Column padding was off by one, the `─────` rule row was missing, the sample table was hand-aligned rather than aligner-produced, and the "Missing required values" block was indented and truncated
- `doctor`: removed a claim that failures produce a "non-zero exit". These are slash commands, so failures surface as an error notification and there is no exit code
- `doctor`: added the `mismatched` status, which was implemented but undocumented
- `render`: documented that it demands the same required values as `execute`
- Added `show` to the command list, and the exact parameters of the `prompt_inspect` / `prompt_execute` Pi tools

### Added

- A test that compares the documented `inspect` sample byte-for-byte against real output, so it cannot drift again
- A test that the packaged skill and the installed copy stay identical, and that the frontmatter version matches the changelog

## [3.0.0]

### Changed

- `execute` is the primary command: it gates on `doctor`, requires a model, requires every required value, renders, runs, and returns the agent's reply
- `doctor` now checks freshness, not just presence. A skill whose bytes differ from the package is `stale` and gets repaired; `--check` reports without writing
- `doctor` exits non-zero when the skills are not usable, and `execute` stops with a two-line message naming the skill and the fix
- Step order is now doctor → find → inspect → verify → execute

### Added

- `inspect` command: a table of every variable with its type, required flag, default, and effective value, plus the required values still missing
- `inspect` step in the pipeline, with guidance on reading `DEFAULT` vs `VALUE`
- A table of every way `execute` can refuse, and the exact fix for each
- Reference to the `prompt_inspect` / `prompt_execute` Pi tools

## [2.0.0]

### Changed

- Step 3 verifies the prompt before filling it, so a template/variables mismatch never reaches a run
- `render` fails only for required variables with no value and no `default`; an optional or defaulted variable is not demanded
- Rendering resolves each variable to its effective value (supplied, else `default`, else empty) before evaluating conditionals

## [1.0.0] - 2026-09-28

### Added

- Initial release of montflow-execute-pi-prompts
- List, show, fill, and render guidance for `@montflow/pi-prompts` prompt templates
- Execution handoff to the current session or a `@montflow/pi-runs` run
