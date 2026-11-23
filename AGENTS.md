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
- format: `bun run fmt:check` / `bun run fmt:fix`
- verify all mf artifacts/invariants: `bun run mf:check`
- verify release metadata (fixed version, tags, changelogs): `bun run mf:check:release`
- pack plugins for Git install: `bun run pack:plugins`
- set montflow up in another repo: `bun run <montflow>/scripts/setup.ts --dir <repo> [--only a,b] [--check]` (README "Setup prompt")
- gate (full): `bun run mf:gate`
- gate (fast, no test suite): `bun run mf:gate:fast`
- install pre-push hook: `bun run hooks:install`

Script names follow `[tool]:[action]`: `mf-<tool>:check` runs one tool
(`mf-prompts:check`, `mf-skills:check`), the generic gates are `fmt:check`,
`lint:check`, and `ts:check`, `mf:check` runs every mf scope, and
`mf:gate[:fast]` is the gate. The old `mf:check:<scope>` names remain as
aliases for frozen records.

## Tools

| CLI | Description |
| --- | --- |
| `mf-skills` | Skill store truth: `verify`, `doctor`, `list`, and `show`. |
| `mf-prompts` | Prompt store truth: `verify`, `doctor`, `list`, and `show`. |
| `mf-profiles` | Profile store truth: `verify`, `doctor`, `list`, and `show`. |
| `mf-reviews` | Review series truth: `verify`, `doctor`, `list`, `show`, `create`, and `resume`. |
| `mf-references` | Reference store truth: `verify`, `doctor`, `list`, `show`, `add`, `update`, and `sync`. |
| `mf-principles` | Principle store truth: `verify`, `doctor`, `list`, and `show`. |
| `mf-playbooks` | Playbook store truth: `verify`, `doctor`, `list`, and `show`. |
| `mf-mode` | Roles and dispatch: `roles [show\|set\|unset\|verify\|resolve]` and `dispatch`. |
| `mf-model-fallback` | Model fallback chains: `status`, `doctor`, and `list`. |

## Verification

- Always verify via package.json scripts. Never invoke tool binaries directly
  (`node_modules/.bin/*`, `bunx`, `npx`) — e.g. never run `vitest`, `oxlint`,
  `oxfmt`, or `tsc` by hand.
- Always scope verification to the working area. Never run repo-wide checks when
  you touched one package. This rule is unconditional: whole-store forms
  (`mf-<domain>:check`, `mf:check`, `mf:gate`) run only when the change spans
  scopes, at the final gate, or when the user asks for them.
  - package scope: `turbo <task> --filter=<package>` from the root, or
    `bun run --cwd <pkg-path> <script>` (e.g. `bun run --cwd packages/core test`).
  - single artifact: the owning package's CLI in its single-artifact form with
    `--dir $PWD` — see the scoped-invocation table in
    `.agents/documentation/author-mf-utility-cli.md`.
  - single test file: `bun run --cwd <pkg-path> test -- <path-to-test-file>`
    (vitest treats the positional arg as a filename filter).
  - lint/format are package-scoped by design (`oxlint .`, `oxfmt .` cover the
    whole package) — scope them with `--filter` / `--cwd`, never by running
    the root `turbo` task unfiltered when only one package changed.
  - typecheck (`ts:check`) is whole-project by nature (`tsc -p`) — scope it to
    the affected package(s) via `--filter`, not the entire repo.

## Shipped artifacts

- Shipped artifacts are package payload declared in each package's
  `payload.json` (`skill`, `profile`, `prompt`, `principle`, `playbook`). `mf-<cli> doctor
  --check` reports without writing; `mf-<cli> doctor` repairs; `bun run mf:doctor`
  repairs every payload package. A manifest-owned file edited locally is
  `stale` and repair overwrites it; an unlisted file in the same store is user
  data and is never deleted.

## Verification gate

- `bun run mf:gate` is the repo-wide gate: `lint:check`, `fmt:check`,
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
- Utility verifies, each runnable alone: `mf-release:check`,
  `mf-skills:check`, `mf-prompts:check`, `mf-profiles:check`,
  `mf-model-fallback:check`, `mf-reviews:check`, `mf-references:check`,
  `mf-principles:check`, `mf-playbooks:check`, `mf-mode:check`.
  They verify release metadata (CLI versions, fixed group, tags, changelogs)
  and this repo's own artifacts (`.agents/skills`, `.agents/@montflow/prompts`,
  `.agents/@montflow/profiles`, `.agents/@montflow/reviews`,
  `.agents/@montflow/references`, `.agents/@montflow/principles`,
  `.agents/@montflow/playbooks`) plus the `payload.json` manifest of every
  package that ships one. Each artifact family runs its `doctor --check`
  (report-only) and fails on drift; `bun run mf:doctor` is the repair path for
  every payload package.
- `release.yml` is separate: it gates publishing, not pushes, and keeps its own
  per-package conditions.

## Skills

- `.agents/skills/` — discovered by scanning this directory
