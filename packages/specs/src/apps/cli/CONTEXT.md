# CLI app

Standalone `mf-specs` command built with `effect/cli`, plus
the slash-command form the OpenCode server plugin (`/specs`) reuses. Subcommands for
agents and humans:

- `check` — mechanically verify the whole spec store (`--dir` selects the
  workspace root, default cwd; the store is `<root>/.agents/@montflow/specs`)
  or one `--name`. Token-lean by default
  (failures + summary); `--verbose` also lists passing specs and the root,
  and adds the cause chain plus a `layers` trace (`consulted`, winning
  `layer`, `phase`) for sizing findings. Verifies the repo-level `sizing.json`
  once and every spec config plus task size, aggregating every finding in one
  run. Exits non-zero when any check fails.
- `status --name <spec>` — readable status panel for one spec:
  lifecycle, counts, the config files found, each phase's review budget and
  effective size -> target mapping, per-task size/target/source, and the
  verification verdict. Exits non-zero when that spec fails verification or a
  config file is invalid.
- `state --name <spec>` — compact derived state, active phase, and
  locked phases for an orchestrator.
- `next --name <spec>` — the ready task set for the active phase, with the
  phase review budget in the header and each task's size, target, and winning
  layer. Exits non-zero on the same config and task-size errors as `check`.
- `resolve --name <spec> --task <id>` — machine-only: prints exactly
  `provider/model#effort` or `inherit`, and exits non-zero through the
  diagnostic renderer for an unknown spec/task or an invalid config.
- `sizing --name <spec> --task <id> [--verbose|--human]` — one compact line
  (id, size, target, winning layer) or the detailed provenance matrix across
  all four sizes and the repo/spec/phase layers, plus the task and phase review
  budgets.
- `which [--branch <name>] [--dir <path>]` — the mechanical spec resolver:
  reads `<dir>/.git` (a directory, or a file naming a worktree's gitdir), reads
  its `HEAD`, parses the branch as `<prefix>/<feature-name>`, and prints exactly
  one spec name. Matching goes through `modules/which` — exact normalized match
  first, then a unique prefix pair, never fuzzy. `--branch` overrides detection
  for tests and CI. `--dir` defaults to the nearest repository root, like
  `author`/`execute`, so the package script resolves the repo's specs. A
  detached HEAD, a branch without a conventional prefix, a missing `.git`, or
  an unreadable `HEAD` all exit non-zero with one `SPEC_NO_MATCH` /
  `SPEC_AMBIGUOUS` diagnostic listing the candidates, the exact `--name` values,
  and `next ask the user`. `execute` calls this same effect instead of copying
  the rule.
- `list` — list every spec with its derived lifecycle state and
  task counts, filtered by `--pending` (unfinished) or by `--status`
  with an exact state list (`completed` is an alias for `complete`).
- `create --name <spec>` — deterministic, model-free scaffold: renders a
  fresh spec tree via `modules/scaffold` and writes it through
  `SpecStore.write`. Refuses to overwrite an existing spec.
- `author --request <text> [--notes <text>]` — loads `spec-create` through
  `modules/prompt` (which gates on `mf-specs doctor`), renders it with the
  request, and prints the prompt and nothing else. Model-free: it never opens a
  session. `--dir` defaults to the nearest repository root so the package
  script reads the repo's `.agents/@montflow/prompts/`.
- `execute [--name <spec>] [--phase <id>] [--focus <text>] [--mode guided|autonomous]`
  — resolves the spec mechanically (explicit `--name` wins, otherwise `which`
  reads the branch), derives `state` and the ready set plus the active phase's
  review budget through `modules/sizing`, renders `spec-execute`, and prints it.
  An absent or ambiguous branch fails with `SPEC_NO_MATCH` / `SPEC_AMBIGUOUS`,
  the candidate list, the exact `--name` values, and `next ask the user`; it
  never picks a spec. `--mode` is parsed at the command boundary before any spec
  read and accepts exactly `guided` (default) and `autonomous`. A phase id no
  task carries fails `spec.phase-not-found`; an id that is not the active phase
  (locked or later) fails `spec.phase-not-active` naming the active phase; a
  spec with no active phase (complete, inconsistent, or all phases locked)
  fails `spec.no-active-phase` and renders no session. A tree `check` rejects
  fails before rendering.
- `models [--provider <id>] [--json] [--catalog <path>] [--verify [--name <spec>]]`
  — the host model catalogue. The table prints one line per model with its
  effort variants (`variants unknown` vs `variants none`) and a `*` on the
  default; `--json` prints the stable, date-free document that is also valid
  `--catalog` input. Outside the host a bare run exits non-zero with
  `models.unavailable` and names `--catalog` as the fix; a malformed file is
  `models.malformed-catalog`. `--verify` cross-checks the repo config, and with
  `--name` that spec's config including every phase override, reporting
  `models.unknown-model` / `models.unknown-effort` warnings in one pass. Unknown
  variants never produce an effort finding.
- `sizing-config [--scope repo|spec|phase] [--name <spec>] [--phase <id>] [--focus <text>] [--mode guided|autonomous]`
  — loads `spec-sizing` through `modules/prompt` (gated on `mf-specs doctor`),
  renders it for one config layer, and prints it. Writes no file and dispatches
  nothing: the wizard the agent runs asks, proposes, confirms, and only then
  writes. No flags leave the scope open so the prompt asks; `--name` alone
  implies spec, `--name --phase` implies phase, and `--scope` wins over that
  implication. `--phase` without `--name`, `--scope spec|phase` without
  `--name`, `--scope phase` without `--phase`, a contradictory `--scope`, a
  blank `--name`, and an unknown `--scope` all fail `cli.invalid-argument` with
  the corrected command. `--mode` reuses `parseMode` (guided default).
- `doctor` — install or verify the packaged spec skills and prompts in
  `<repo>/.agents/`. Idempotent; the repo root is resolved from the working
  directory unless `--dir` names it (`apps/doctor`). Repair mode reports
  `installed` (created),
  `repaired` (rewrote), and `present` (already current); a payload it cannot
  write is `blocked` with a coded diagnostic naming the path and the fix.
  `--check` reports the same payloads without writing and exits `1` when
  anything is `missing`, `stale`, or `blocked`.

Every sizing failure renders through one agent-first diagnostic: stable `code`,
`path`, `field`, `problem`, `expected`, `actual`, `fix`, `cause`, and `next`.
Every command body runs through `runDiagnosed`, so `diagnoseCause` sees every
caught `Cause`: an expected failure renders its own block and exits `1`, an
unrecognised expected failure renders `failure.unhandled` (still `1`), a pure
interruption exits `130` with no block, and an unexpected defect is labelled
`internal` and exits `2` with its stack shown only under `--verbose`. `status`
and `next` gate their target columns on `dispatchExitCode` — the same config and
task-size errors `check` reports — so no dispatchable target is printed for a
task the contract calls invalid, and all three agree on the exit code.

## Belongs here

- Pure engines (`check`, `status`, `list`, `scaffold`, `loadSizing`,
  `sizingOf`, `models`, `listModels`, `verifyModels`, `which`, `author`,
  `execute`, `sizingConfig`, `resolveSizingScope`, `stateOf`) over the
  `SpecStore` service, the prompt loader, and the host model catalogue
- Pure renderers (`renderCheck`, `renderStatus`, `renderNext`, `renderList`,
  `renderScaffold`, `renderSizing`, `renderSizingReport`, `renderModelFindings`,
  `renderDiagnostic`, `renderWhich`)
  — the token-efficiency contract and the agent-first diagnostic shape live here
- `diagnoseCause` — maps expected failures (recognised and unrecognised,
  including `PromptError`) to `1`, interruption to `130`, and internal defects
  to `2`
- Dispatch gating (`dispatchErrors`, `dispatchErrorText`, `dispatchExitCode`)
  shared by `status` and `next`, and `runDiagnosed` — the one command boundary
  that catches `Cause`
- `Command`/`Flag` wiring (`checkCommand`, `statusCommand`, `resolveCommand`,
  `sizingCommand`, `whichCommand`, `listCommand`, `createCommand`,
  `authorCommand`, `executeCommand`, `sizingConfigCommand`, `doctorCommand`,
  `rootCommand`)
- The slash-command form (`runSlash`, `SlashReport`) reused by `server.ts`
- The `main.ts` binary entry

## Does not belong here

- Verification rules — `modules/spec` + `modules/structure`
- Filesystem reading and writing — the `SpecStore` service
- Spec file templates — `modules/scaffold`
- Prompt loading, rendering, and the doctor gate — `modules/prompt`
- Dispatching a rendered prompt — `apps/server` (`spec_author` /
  `spec_execute`) and the host `subagent`/session seams; the CLI never dispatches

## Running

```bash
# from anywhere in the repo (workspace bin link created by the root devDependency)
bunx mf-specs check
npx mf-specs check --name ship-spec --verbose

# or by package script
bun run --cwd packages/specs cli check
bun run --cwd packages/specs cli list --pending

# install the packaged spec skills into the repo
bun run --cwd packages/specs cli doctor
```

From a registry, `npx @montflow/specs` / `bunx @montflow/specs`
require publishing (the package is `private` today). The `bin` is a `.ts`
entry with `#!/usr/bin/env bun`, so it needs Bun on the machine; a Node
target build would be required for `npx` without Bun.

In OpenCode, the same engines are exposed as `/specs` by
`src/server.ts` (`check [--name <spec>] [--verbose]` /
`status --name <spec>` / `state --name <spec>` / `next --name <spec>` /
`resolve --name <spec> --task <id>` /
`sizing --name <spec> --task <id> [--verbose|--human]` /
`which [--branch <name>] [--dir <path>]` /
`list [--pending | --status <states>] [--verbose]` /
`models [--provider <id>] [--json] [--catalog <path>] [--verify [--name <spec>]]` /
`create --name <spec> [--description <text>] [--author <name>]
[--workspace-type <in-place|worktree>] [--tasks <name[:type[:gates[:size]]],…>]` /
`author --request <text> [--notes <text>]` /
`execute [--name <spec>] [--phase <id>] [--focus <text>] [--mode guided|autonomous]` /
`sizing-config [--scope repo|spec|phase] [--name <spec>] [--phase <id>] [--focus <text>] [--mode guided|autonomous]`).
The same plugin registers the `spec_author`, `spec_execute`, `spec_sizing`, and
`spec_models` tools
(`apps/server`). The prompt tools dispatch the rendered text through
`@montflow/prompts`' executor and the host `ModelPort` + `SessionDispatchPort`;
`spec_models` reads the same host `ModelPort` catalogue the slash form prints.
Prose values for `--request`, `--notes`, and `--focus` are joined up to the next
`--flag`, so a slash invocation keeps its spaces without shell quoting.

## Building & distributing

Two supported paths — neither needs Node or a model at runtime:

- **Standalone binary (recommended):** `bun run --cwd packages/specs build:cli`
  emits `dist/mf-specs` via `bun build --compile`. The Bun runtime is
  embedded, so the single file runs anywhere on that platform with no
  install — and so are the packaged skills and prompts
  (`bun run generate:payload`), so `doctor` can install and verify them with
  no package checkout beside the binary. Cross-compile with `--target=bun-linux-x64`,
  `bun-linux-arm64`, `bun-darwin-x64`, `bun-darwin-arm64`,
  `bun-windows-x64` — e.g. `bun run --cwd packages/specs build:cli -- --target=bun-darwin-arm64`.
  Ship the artifact as a GitHub release asset (the npm release workflow
  skips private packages).
- **`bun run` from source:** the `bin` entry (`src/apps/cli/main.ts`,
  `#!/usr/bin/env bun`) works with `bun link` for local/agent use where
  Bun is installed.

Everything `check`/`status`/`list`/`create`/`author`/`execute`/`sizing-config`
do is pure filesystem work, so the binary and slash command work fully offline:
`author`, `execute`, and `sizing-config` load, render, and print a prompt but
never dispatch it. Only the host `spec_author` / `spec_execute` / `spec_sizing`
tools reach a model and a session.

## Parallelism

`check` verifies specs concurrently with `Effect.forEach` (bounded by
`--concurrency`, default 8); `list` reads them concurrently under the
same bound. The per-spec work is a pure `verifySpecTree` / `analyze`
call, so a `worker_threads`-backed executor can be swapped in behind the
same engine without touching the rules.
