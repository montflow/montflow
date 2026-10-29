# montflow

## Response Style

- Always respond using the `i-have-adhd` skill
  (`.agents/skills/i-have-adhd/SKILL.md`) — every turn, every task. Skip it only
  when the user explicitly says not to (e.g. "don't use i-have-adhd", "skip the
  ADHD style").

## Language

TypeScript, Effect v4

## Package Manager

bun@1.3.13 — lockfile is source of truth

## Commands

- install: `bun install`
- test: `turbo test`
- smoke (plugin loader): `bun run --cwd packages/opencode smoke`
- tui suite: `bun run test:tui` (turbo `test:tui`, `apps/workspace` `.test.tsx`)
- typecheck: `turbo ts:check`
- lint: `turbo lint:check` / `turbo lint:fix`
- format: `turbo format:check` / `turbo format:fix`
- verify all mf artifacts/invariants: `bun run mf:check`
- pack plugins for Git install: `bun run pack:plugins`
- gate (full): `bun run mf:gate`
- gate (fast, no test suite): `bun run mf:gate:fast`
- install pre-push hook: `bun run hooks:install`

Script names follow `[tool]:[action]:[scope]`: `mf:check:<scope>` runs one
scope, `mf:check` runs every scope, `mf:gate[:fast]` is the gate.

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

- `bun run mf:gate` is the repo-wide gate: `lint:check`, `format:check`,
  `ts:check`, `turbo test`, `turbo test:tui` (the workspace TUI `.test.tsx`
  suite), `turbo smoke` (the `@opencode/plugin` loader smoke), then every
  `mf:check` scope. CI
  runs each check as its own matrix cell in `.github/workflows/verify.yml` (push,
  pull request, merge queue, manual). The workflow installs and builds once,
  saves the resulting workspace as an artifact, then fans the matrix out off
  that single artifact.
- `mf:gate:fast` drops the test suite and the smoke. The Lefthook
  `pre-push` hook runs it; install once per clone with
  `bun run hooks:install`, bypass with `git push --no-verify` or `LEFTHOOK=0`.
- Utility verifies, each runnable alone: `mf:check:skills`,
  `:prompts`, `:specs`, `:profiles`, `:reviews`. They verify this repo's
  own artifacts (`.agents/skills`, `.agents/@montflow/prompts`,
  `.agents/@montflow/specs`, `.agents/@montflow/profiles`,
  `.agents/@montflow/reviews`) plus packaged-skill freshness.
- `release.yml` is separate: it gates publishing, not pushes, and keeps its own
  per-package conditions.

## Spec prompts

- `packages/specs/prompts/` is the only source of `spec-create`,
  `spec-execute`, and `spec-sizing`; `.agents/@montflow/prompts/` is
  doctor-owned and never hand-edited.
- Change the package file, then sync with
  `bun run --cwd packages/specs cli doctor`; verify with `mf:check:specs`.
- Render with `mf-specs author --request "<text>"`,
  `mf-specs execute [--name <spec>] [--mode guided|autonomous]`, or
  `mf-specs sizing-config [--scope repo|spec|phase] [--name <spec>]`. Without
  `--name`, `execute` resolves the spec from the branch through
  `mf-specs which` and asks the user only on a miss or ambiguity.
- `spec-sizing` generates one sizing layer from the live catalogue — the
  `spec_models` tool in the host, `mf-specs models --catalog <path>` outside it;
  never hand-write a model id or an effort into `sizing.json`.
- `guided` is the default; `autonomous` asks only for destructive or
  irreversible actions, very dangerous tool calls, or undecidable decisions.

## Skills

- `.agents/skills/` — discovered by scanning this directory
