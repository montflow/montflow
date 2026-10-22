# montflow

## Language

TypeScript, Effect v4

## Package Manager

bun@1.3.13 — lockfile is source of truth

## Commands

- install: `bun install`
- test: `turbo test`
- smoke (plugin loader): `bun run --cwd packages/opencode smoke`
- typecheck: `turbo ts:check`
- lint: `turbo lint:check` / `turbo lint:fix`
- format: `turbo format:check` / `turbo format:fix`
- dependency drift: `bun run verify:montflow:compat`
- distribution boundary: `bun run verify:montflow:distribution`
- pack plugins for Git install: `bun run pack:plugins`
- verify (full gate): `bun run verify:montflow`
- verify (fast, no test suite): `bun run verify:montflow:fast`
- install pre-push hook: `bun run hooks:install`

## Verification

- Always verify via package.json scripts. Never invoke tool binaries directly
  (`node_modules/.bin/*`, `bunx`, `npx`) — e.g. never run `vitest`, `oxlint`,
  `oxfmt`, or `tsc` by hand.
- Always scope verification to the working area. Never run repo-wide checks when
  you touched one package:
  - package scope: `turbo <task> --filter=<package>` from the root, or
    `bun run --cwd <pkg-path> <script>` (e.g. `bun run --cwd packages/core test`).
  - single test file: `bun run --cwd <pkg-path> test -- <path-to-test-file>`
    (vitest treats the positional arg as a filename filter).
  - lint/format are package-scoped by design (`oxlint .`, `oxfmt .` cover the
    whole package) — scope them with `--filter` / `--cwd`, never by running
    the root `turbo` task unfiltered when only one package changed.
  - typecheck (`ts:check`) is whole-project by nature (`tsc -p`) — scope it to
    the affected package(s) via `--filter`, not the entire repo.

## Verification gate

- `bun run verify:montflow` is the repo-wide gate: `lint:check`, `format:check`,
  `ts:check`, `turbo test`, `turbo smoke` (the `@opencode/plugin` loader smoke),
  the dependency-drift and distribution checks, then the extension verifies. CI
  runs each check as its own matrix cell in `.github/workflows/verify.yml` (push
  to `main`).
- `verify:montflow:fast` drops the test suite and the smoke. The Lefthook
  `pre-push` hook runs it; install once per clone with
  `bun run hooks:install`, bypass with `git push --no-verify` or `LEFTHOOK=0`.
- `verify:montflow:compat` asserts every workspace `effect`,
  `@effect/platform-node`, `@effect/platform-node-shared`, `@effect/vitest`,
  `@opencode/*`, `@opentui/*`, and `solid-js` pin (declared and resolved, from
  `bun.lock`) against the installed `@opencode/plugin` catalog. Any divergence
  fails, and the root `@effect/platform-node-shared` override is required — the
  `^4.0.0-rc.112` range otherwise resolves to `4.0.3`, which imports the
  removed `effect/cluster/Runners`.
- `verify:montflow:distribution` asserts every plugin package is `private`,
  changeset-ignored, Git-installable (`repository.directory`, resolvable
  `exports`/`bin`), and packs to a self-contained published artifact with no
  `workspace:` or `@montflow/*` dependency. `bun run pack:plugins` emits those
  artifacts under `dist/pack/` for the Git subpath install.
- Extension verifies, each runnable alone: `verify:montflow:skills`,
  `:prompts`, `:specs`, `:profiles`, `:reviews`. They verify this repo's
  own artifacts (`.agents/skills`, `.agents/@montflow/pi-prompts`,
  `.agents/@montflow/specs`, `.agents/@montflow/profiles`,
  `.agents/@montflow/reviews`) plus packaged-skill freshness.
- `release.yml` is separate: it gates publishing, not pushes, and keeps its own
  per-package conditions.

## Skills

- `.agents/skills/` — discovered by scanning this directory
