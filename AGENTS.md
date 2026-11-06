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
- gate (full): `bun run mf:gate`
- gate (fast, no test suite): `bun run mf:gate:fast`
- install pre-push hook: `bun run hooks:install`

Script names follow `[tool]:[action]`: `mf-<tool>:check` runs one tool
(`mf-specs:check`, `mf-skills:check`), the generic gates are `fmt:check`,
`lint:check`, and `ts:check`, `mf:check` runs every mf scope, and
`mf:gate[:fast]` is the gate. The old `mf:check:<scope>` names remain as
aliases for frozen records.

## Tools

| CLI | Description |
| --- | --- |
| `mf-specs` | Spec tree truth: `status`, `state`, `next`, `list`, `check`, and `doctor`. Ask it before reading spec files. |

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

## Specs (v2)

- Store: `.agents/@montflow/specs/<name>/` — `SPEC.md` plus one directory per
  phase. A phase is a directory, never the leading letters of a task id.
- `spec-version: 2` is current. A spec with no `spec-version` reads as v1: the
  phase tree without `PHASE.md`. It verifies with a `spec.version-outdated`
  warning, never an error, and no surface infers v2 from file presence. Upgrade
  with `mf-specs migrate --name <name>`; a `status: complete` spec stays frozen
  at v1 unless the owner passes `--include-complete`.
- Phase directory: `PHASE.md` (objective, status, review decision, gate kind),
  `MEMORY.md`, `BOARD.md`, optional `GATES.md` and `GATE-RESULTS.jsonl`, and the
  task directories. Task directory: `TASK.md`, `MEMORY.md`, optional `GATES.md`,
  `MAILBOX.md`, and `GATE-RESULTS.jsonl`.
- Ids, statuses, timestamps, locks, and gate results are generated:
  `init`, `new-phase`, `new-task`, `stamp`, `claim`, `lock`, `waiver`, `rigor`,
  `gate run`, `gate record`, `mail`, and `review decide`. A lock is derived from
  completion, gate proof, and a closed review round or effective waiver;
  `mf-specs lock` only confirms it and stores nothing. No surface reads a
  stored lock list, and no phase reserves a `*099` review task.
- Every surface reads the same phase tree: the `mf-specs` binary, `/specs` in
  the OpenCode host, the `spec_author` / `spec_execute` / `spec_status` /
  `spec_sizing` / `spec_rigor` / `spec_models` tools, and the TUI picker. The
  TUI offers only directories holding `SPEC.md`, never a phase or task
  directory.
- Shipped artifacts are package payload declared in each package's
  `payload.json` (`skill`, `profile`, `prompt`, `rigor`). `mf-<cli> doctor
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
  `mf-skills:check`, `mf-prompts:check`, `mf-specs:check`,
  `mf-profiles:check`, `mf-model-fallback:check`, `mf-reviews:check`,
  `mf-references:check`. They verify
  release metadata (CLI versions, fixed group, tags, changelogs) and this
  repo's own artifacts (`.agents/skills`, `.agents/@montflow/prompts`,
  `.agents/@montflow/specs`, `.agents/@montflow/profiles`,
  `.agents/@montflow/reviews`, `.agents/@montflow/references`,
  `.agents/@montflow/rigors`) plus the `payload.json` manifest of every package
  that ships one. Each artifact family runs its `doctor --check` (report-only)
  and fails on drift; `bun run mf:doctor` is the repair path for every payload
  package.
- `release.yml` is separate: it gates publishing, not pushes, and keeps its own
  per-package conditions.

## Spec completion gate

- A change names the specs it closes with one `Spec: <kebab-name>` trailer per
  spec in a commit message (repeat the line for several specs). No trailer means
  no spec is gated.
- CI job `spec-completion` reads the trailers from the pushed range and runs
  `bun run --cwd packages/specs cli check --dir "$PWD" --name <spec> --require-complete`
  for each. A missing spec, a spec that does not verify, a spec whose `SPEC.md`
  status is not `complete`, or an invalid trailer fails the job. It is a
  standalone job, not part of the `verify` matrix.
- Without `--name`, `--require-complete` gates every spec in the store; the
  trailer form always names one spec.
- Run it locally before pushing:
  `bun run --cwd packages/specs cli check --dir "$PWD" --name <spec> --require-complete`.
- The rule applies to every spec in the store; only declared specs are gated, so
  an unrelated in-progress spec never blocks a change.

## Skills

- `.agents/skills/` — discovered by scanning this directory
