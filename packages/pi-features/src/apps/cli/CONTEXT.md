# CLI app

Standalone `mf-features` command built with `effect/unstable/cli`, plus
the slash-command form the Pi extension reuses. Three subcommands for
agents and humans:

- `check` — mechanically verify the whole feature root (default
  `.agents/@montflow/features`) or one `--name`. Token-lean by default
  (failures + summary); `--verbose` also lists passing features and the
  root. Exits non-zero when any feature fails.
- `status --name <feature>` — readable status panel for one feature:
  lifecycle, counts, per-phase task list, verification verdict. Exits
  non-zero when that feature fails verification.
- `doctor` — install the packaged feature-creation skill into
  `<repo>/.agents/skills/montflow-create-pi-features/`. Idempotent; the
  repo root is resolved from the working directory (`apps/doctor`).

## Belongs here

- Pure engines (`check`, `status`) over the `FeatureStore` service
- Pure renderers (`renderCheck`, `renderStatus`) — the token-efficiency
  contract lives here
- `Command`/`Flag` wiring (`checkCommand`, `statusCommand`, `doctorCommand`, `rootCommand`)
- The slash-command form (`runSlash`, `SlashReport`) reused by `extension.ts`
- The `main.ts` binary entry

## Does not belong here

- Verification rules — `modules/feature` + `modules/structure`
- Filesystem reading — the `FeatureStore` service
- Writing or fixing features — future authoring flows

## Running

```bash
# from anywhere in the repo (workspace bin link created by the root devDependency)
bunx mf-features check
npx mf-features check --name ship-feature --verbose

# or by package script
bun run --cwd packages/pi-features cli check

# install the feature-creation skill into the repo
bun run --cwd packages/pi-features cli doctor
```

From a registry, `npx @montflow/pi-features` / `bunx @montflow/pi-features`
require publishing (the package is `private` today). The `bin` is a `.ts`
entry with `#!/usr/bin/env bun`, so it needs Bun on the machine; a Node
target build would be required for `npx` without Bun.

Inside Pi, the same engines are exposed as `/mf-features` by
`src/extension.ts` (`check [--name <feature>] [--verbose]` /
`status --name <feature>`).

## Building & distributing

Two supported paths — neither needs Node or a model at runtime:

- **Standalone binary (recommended):** `bun run --cwd packages/pi-features build:cli`
  emits `dist/mf-features` via `bun build --compile`. The Bun runtime is
  embedded, so the single file runs anywhere on that platform with no
  install. Cross-compile with `--target=bun-linux-x64`,
  `bun-linux-arm64`, `bun-darwin-x64`, `bun-darwin-arm64`,
  `bun-windows-x64` — e.g. `bun run --cwd packages/pi-features build:cli -- --target=bun-darwin-arm64`.
  Ship the artifact as a GitHub release asset (the npm release workflow
  skips private packages).
- **`bun run` from source:** the `bin` entry (`src/apps/cli/main.ts`,
  `#!/usr/bin/env bun`) works with `bun link` for local/agent use where
  Bun is installed.

Everything `check`/`status` do is pure filesystem work, so the binary and
slash command work fully offline. Only future agentic features would
require Pi and a model.

## Parallelism

`check` verifies features concurrently with `Effect.forEach` (bounded by
`--concurrency`, default 8). The per-feature work is a pure
`verifyFeatureTree` call, so a `worker_threads`-backed executor can be
swapped in behind the same engine without touching the rules.
