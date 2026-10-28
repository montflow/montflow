# CLI app

Standalone `mf-specs` command built with `effect/cli`, plus
the slash-command form the OpenCode server plugin (`/mf-specs`) reuses. Subcommands for
agents and humans:

- `check` — mechanically verify the whole spec store (`--dir` selects the
  workspace root, default cwd; the store is `<root>/.agents/@montflow/specs`)
  or one `--name`. Token-lean by default
  (failures + summary); `--verbose` also lists passing specs and the
  root. Exits non-zero when any spec fails.
- `status --name <spec>` — readable status panel for one spec:
  lifecycle, counts, per-phase task list, verification verdict. Exits
  non-zero when that spec fails verification.
- `state --name <spec>` — compact derived state, active phase, and
  locked phases for an orchestrator.
- `next --name <spec>` — the ready task set for the active phase.
- `list` — list every spec with its derived lifecycle state and
  task counts, filtered by `--pending` (unfinished) or by `--status`
  with an exact state list (`completed` is an alias for `complete`).
- `create --name <spec>` — deterministic, model-free scaffold: renders a
  fresh spec tree (`<PHASE>/<PHASE><NNN>-<name>/`) via `modules/scaffold` and
  writes it through `SpecStore.write`. Refuses to overwrite an existing spec.
- `migrate --name <spec> | --all [--dry-run]` — plans one move per flat task
  directory, applies them through `SpecStore.move`, and verifies the result.
  Refuses a mixed tree; a no-op on an already-migrated spec.
- `doctor` — install the packaged spec skills into
  `<repo>/.agents/skills/`. Idempotent; the repo root is resolved from
  the working directory (`apps/doctor`).

## Belongs here

- Pure engines (`check`, `status`, `list`, `scaffold`, `migrate`) over the
  `SpecStore` service
- Pure renderers (`renderCheck`, `renderStatus`, `renderList`,
  `renderScaffold`, `renderMigrate`) — the token-efficiency contract lives here
- `Command`/`Flag` wiring (`checkCommand`, `statusCommand`, `listCommand`,
  `createCommand`, `migrateCommand`, `doctorCommand`, `rootCommand`)
- The slash-command form (`runSlash`, `SlashReport`) reused by `server.ts`
- The `main.ts` binary entry

## Does not belong here

- Verification rules — `modules/spec` + `modules/structure`
- Filesystem reading and writing — the `SpecStore` service
- Spec file templates — `modules/scaffold`
- Dispatching author or orchestrator sessions — the native `subagent` tool

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

In OpenCode, the same engines are exposed as `/mf-specs` by
`src/server.ts` (`check [--name <spec>] [--verbose]` /
`status --name <spec>` / `state --name <spec>` / `next --name <spec>` /
`list [--pending | --status <states>] [--verbose]` /
`create --name <spec> [--description <text>] [--author <name>]
[--workspace-type <in-place|worktree>] [--tasks <name[:type[:gates]],…>]` /
`migrate [--name <spec> | --all] [--dry-run]`).

## Building & distributing

Two supported paths — neither needs Node or a model at runtime:

- **Standalone binary (recommended):** `bun run --cwd packages/specs build:cli`
  emits `dist/mf-specs` via `bun build --compile`. The Bun runtime is
  embedded, so the single file runs anywhere on that platform with no
  install. Cross-compile with `--target=bun-linux-x64`,
  `bun-linux-arm64`, `bun-darwin-x64`, `bun-darwin-arm64`,
  `bun-windows-x64` — e.g. `bun run --cwd packages/specs build:cli -- --target=bun-darwin-arm64`.
  Ship the artifact as a GitHub release asset (the npm release workflow
  skips private packages).
- **`bun run` from source:** the `bin` entry (`src/apps/cli/main.ts`,
  `#!/usr/bin/env bun`) works with `bun link` for local/agent use where
  Bun is installed.

Everything `check`/`status`/`list`/`create` do is pure filesystem
work, so the binary and slash command work fully offline. Only agentic
spec authoring or execution would require a host and a model.

## Parallelism

`check` verifies specs concurrently with `Effect.forEach` (bounded by
`--concurrency`, default 8); `list` reads them concurrently under the
same bound. The per-spec work is a pure `verifySpecTree` / `analyze`
call, so a `worker_threads`-backed executor can be swapped in behind the
same engine without touching the rules.
