# montflow

## Language

TypeScript, Effect v4

## Package Manager

bun@1.3.13 — lockfile is source of truth

## Commands

- install: `bun install`
- test: `turbo test`
- typecheck: `turbo ts:check`
- lint: `turbo lint:check` / `turbo lint:fix`
- format: `turbo format:check` / `turbo format:fix`
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
  `ts:check`, `turbo test`, then the extension verifies. CI runs each check as
  its own matrix cell in `.github/workflows/verify.yml` (push to `main`).
- `bun run verify:montflow:fast` drops the test suite. The Lefthook `pre-push`
  hook runs it; install once per clone with `bun run hooks:install`, bypass with
  `git push --no-verify` or `LEFTHOOK=0`.
- Extension verifies, each runnable alone: `verify:montflow:skills`,
  `:prompts`, `:specs`, `:profiles`, `:runs`. They verify this repo's own
  artifacts (`.agents/skills`, `.agents/@montflow/pi-prompts`,
  `.agents/@montflow/specs`, `.agents/@montflow/profiles`) plus packaged-skill
  freshness.
- `release.yml` is separate: it gates publishing, not pushes, and keeps its own
  per-package conditions.

## Skills

- `.agents/skills/` — discovered by scanning this directory
