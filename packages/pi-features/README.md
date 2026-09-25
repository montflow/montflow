# @montflow/pi-features

Feature-spec primitives and a CLI for montflow — schema-backed parsing,
mechanical verification, and a status panel for the files the
`authoring-feature-spec` / `executing-feature-spec` skills generate.

## CLI

```bash
# from anywhere in the repo (workspace bin link via the root devDependency)
bunx mf-features check --name ship-feature
npx mf-features check --name ship-feature

# or by package script
bun run --cwd packages/pi-features cli check
```

- `check` — verifies the whole feature root (default
  `.agents/@montflow/features`) or one `--name`. Token-lean by default
  (failures + summary); `--verbose` also lists passing features and the
  root. Exits non-zero when any feature fails.
- `status --name <feature>` — lifecycle, task counts, per-phase task
  list, and verification verdict. Exits non-zero when the feature fails
  verification.

`npx`/`bunx` resolve the workspace `bin` link inside this repo (the root
`devDependencies` entry is what creates it). From a registry
(`npx @montflow/pi-features` / `bunx @montflow/pi-features`) the package
must be published first — it is `private` today. The `bin` is a `.ts`
entry with `#!/usr/bin/env bun`, so registry use needs Bun on the
machine; a Node build would be required for `npx` without Bun.

Built with `effect/unstable/cli`. Sample features for trying the binary
live in [`fixtures/`](fixtures/README.md): `mock-ok` (not-started),
`mock-complete` (complete), `mock-stale` (inconsistent), and `mock-bad`
(10 issues across every failure class).

## Library surface

- **`Feature`** — `Feature` Schema Class, `FeatureStatus`,
  `WorkspaceType`, `parseFeatureFile`, `verifyFeatureFile`, and the task
  table (`TaskRow`, `parseTaskTable`).
- **`Task`** — `Task` Schema Class, `TaskId`, `TaskType`, `TaskStatus`,
  `parseTaskDirName`, `parseTaskFile`, `verifyTaskFile`, plus the
  task-id / directory / originator patterns.
- **`Gates`** — `parseGates`, `verifyGatesFile` (stages + checklist
  items, no placeholders).
- **`Memory`** — `verifyMemoryFile`, `MEMORY_SECTIONS` (title + template
  sections).
- **`Lifecycle`** — `analyze` / `verify`: derives `not-started` /
  `in-progress` / `blocked` / `complete` / `inconsistent` and rejects
  invalid states (e.g. `complete` with pending tasks, all-done but
  `in-progress`, locked phases that are not finished or not a prefix).
- **`Structure`** — `verifyFeatureTree` over an in-memory
  `FeatureSnapshot`: required files, task-directory naming and placement,
  id/name agreement, task-table agreement (name/type/status/gates),
  dependency validity (existence, phase order, cycles), one `review` task
  per phase, and `locked-phases` sanity.
- **`Verify` / `Frontmatter`** — shared `Issue` / `Result` vocabulary and
  the tolerant frontmatter grammar.
- **`FeatureStore`** — filesystem reader (`names`, `hasRoot`, `exists`,
  `snapshot`) backing the CLI.
- **`Cli`** — pure engines (`check`, `status`), pure renderers
  (`renderCheck`, `renderStatus`), and the `effect/unstable/cli` commands.

All verification is pure and non-throwing: it returns a `Result` with an
issue list, so callers can render or repair.

## Status

Early (`0.0.1`, private). Targets the authoring-feature-spec file
contract. The `pi/zi` extension currently uses a different spec layout
(`.agents/@montflow/specs/`). Source-only — no build step: Pi loads the
`.ts` files directly, same as `pi/zi`.
