# CLI app

Standalone `mf-specs` command built with `effect/unstable/cli`, plus
the slash-command form the Pi extension reuses. Four subcommands for
agents and humans:

- `check` — mechanically verify the whole spec root (default
  `.agents/@montflow/specs`) or one `--name`. Token-lean by default
  (failures + summary); `--verbose` also lists passing specs and the
  root. Exits non-zero when any spec fails.
- `status --name <spec>` — readable status panel for one spec:
  lifecycle, counts, per-phase task list, verification verdict. Exits
  non-zero when that spec fails verification.
- `list` — list every spec with its derived lifecycle state and
  task counts, filtered by `--pending` (unfinished) or by `--status`
  with an exact state list (`completed` is an alias for `complete`).
- `doctor` — install the packaged spec skills into
  `<repo>/.agents/skills/`. Idempotent; the repo root is resolved from
  the working directory (`apps/doctor`).

## Belongs here

- Pure engines (`check`, `status`, `list`) over the `SpecStore`
  service
- Pure renderers (`renderCheck`, `renderStatus`, `renderList`) — the
  token-efficiency contract lives here
- `Command`/`Flag` wiring (`checkCommand`, `statusCommand`, `listCommand`, `doctorCommand`, `rootCommand`)
- The slash-command form (`runSlash`, `SlashReport`) reused by `extension.ts`
- The `main.ts` binary entry

## Does not belong here

- Verification rules — `modules/spec` + `modules/structure`
- Filesystem reading — the `SpecStore` service
- Writing or fixing specs — future authoring flows

## Running

```bash
# from anywhere in the repo (workspace bin link created by the root devDependency)
bunx mf-specs check
npx mf-specs check --name ship-spec --verbose

# or by package script
bun run --cwd packages/pi-specs cli check
bun run --cwd packages/pi-specs cli list --pending

# install the packaged spec skills into the repo
bun run --cwd packages/pi-specs cli doctor
```

From a registry, `npx @montflow/pi-specs` / `bunx @montflow/pi-specs`
require publishing (the package is `private` today). The `bin` is a `.ts`
entry with `#!/usr/bin/env bun`, so it needs Bun on the machine; a Node
target build would be required for `npx` without Bun.

Inside Pi, the same engines are exposed as `/mf-specs` by
`src/extension.ts` (`check [--name <spec>] [--verbose]` /
`status --name <spec>` / `list [--pending | --status <states>]
[--verbose]`).

## Building & distributing

Two supported paths — neither needs Node or a model at runtime:

- **Standalone binary (recommended):** `bun run --cwd packages/pi-specs build:cli`
  emits `dist/mf-specs` via `bun build --compile`. The Bun runtime is
  embedded, so the single file runs anywhere on that platform with no
  install. Cross-compile with `--target=bun-linux-x64`,
  `bun-linux-arm64`, `bun-darwin-x64`, `bun-darwin-arm64`,
  `bun-windows-x64` — e.g. `bun run --cwd packages/pi-specs build:cli -- --target=bun-darwin-arm64`.
  Ship the artifact as a GitHub release asset (the npm release workflow
  skips private packages).
- **`bun run` from source:** the `bin` entry (`src/apps/cli/main.ts`,
  `#!/usr/bin/env bun`) works with `bun link` for local/agent use where
  Bun is installed.

Everything `check`/`status`/`list` do is pure filesystem work, so the
binary and slash command work fully offline. Only future agentic
specs would require Pi and a model.

## Parallelism

`check` verifies specs concurrently with `Effect.forEach` (bounded by
`--concurrency`, default 8); `list` reads them concurrently under the
same bound. The per-spec work is a pure `verifySpecTree` / `analyze`
call, so a `worker_threads`-backed executor can be swapped in behind the
same engine without touching the rules.
