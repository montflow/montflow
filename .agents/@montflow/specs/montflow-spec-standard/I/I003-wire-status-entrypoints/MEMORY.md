# Memory

## Context

- I003 exposes the I002 `spec-status` prompt on the three I001 surfaces: binary
  `mf-specs status-report`, `/specs status-report`, and the `spec_status` host
  tool. `mf-specs status` stays the raw, unchanged panel.
- Read: phase brief/BOARD, TASK/GATES, I001 entry-point contract, shipped
  `prompts/spec-status.json`, `cli.status`/`slash`/`author`/`tools`, `which`,
  `modules/prompt`, server tools, and their tests.

## Progress

- Added `cli.statusreport.module.ts`: `statusReport(root, {name?, focus?,
  branch?, workspace?})` resolves an explicit name first or reuses `which`,
  checks root/existence with the raw commands' diagnostics, then loads
  `spec-status` through `modules/prompt`; `statusReportCommand` renders and
  prints only.
- Wired `status-report` into `rootCommand`, `SLASH_COMMANDS`, its
  `['name','focus']` flag row, `slashStatusReport`, and the exhaustive
  `slashArm`; added `spec_status` (`SpecStatusInput`, `specStatusTool`) and
  registered it in `server.ts`. Help text, `GUARD_RERUN.statusReport`, README,
  CLI CONTEXT, and the `montflow-find-specs` skill now name the surface.
- Skill bumped to 1.7.0 with a changelog entry; installed `.agents/skills/`
  copy synced so the doctor gate stays current.

## Findings

- I001 chose no internal prompt variables: `status-report` fills only `name` and
  optional `focus`; it reads no spec content, so broken/unreadable specs still
  render their own terminal state.
- Name resolution reuses `which` exactly; explicit `--name` is guarded by
  `guardSpecName` before any read and checked with `store.exists`, so an unknown
  name is `spec.not-found` and a missing root is `store.error`.
- Binary/slash only print `prompt.text`; `spec_status` dispatches the same
  rendered text and skill list through the shared `PromptExecutor`, with the
  host default model via `modelOf`.

## Gates

- `bun run --cwd packages/specs test -- src/apps/cli/tests/status.test.ts
  src/apps/cli/tests/which.test.ts src/apps/cli/tests/run-slash.test.ts`:
  6 files, 180 tests passed, no type errors. Log: `/tmp/I003.log`.
- `bun run --cwd packages/specs test -- src/apps/server/tests/spec-tools.test.ts`:
  2 files, 80 tests passed. Log: `/tmp/I003-host.log`.
- `bun run --cwd packages/specs ts:check`, `lint:check`, `format:check`: green.
- Binary smoke: `status-report --name montflow-spec-standard` prints the
  installed prompt; a malformed name prints `cli.invalid-argument` with
  `next mf-specs status-report --name <spec>`.

## Open Questions

- None.

## Handoff

- I099 reviews the prompt, payload, entry points, and read-only boundary as one
  read path. The slash and host arms need no further wiring.

## Deviations

- Synced the installed `.agents/skills/montflow-find-specs/` copy from the
  package after the skill edit; this is the doctor-managed install, not a
  second source of truth.
