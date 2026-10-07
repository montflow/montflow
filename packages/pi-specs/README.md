# @montflow/pi-specs

Spec primitives and a CLI for montflow — schema-backed parsing,
mechanical verification, a status panel, and the authoring/executing skill
text injected into dispatched runs.

## CLI

```bash
# from anywhere in the repo (workspace bin link via the root devDependency)
bunx mf-specs check --name ship-spec
npx mf-specs check --name ship-spec

# or by package script
bun run --cwd packages/pi-specs cli check
```

- `check` — verifies the whole spec root (default
  `.agents/@montflow/specs`) or one `--name`. Token-lean by default
  (failures + summary); `--verbose` also lists passing specs and the
  root. Exits non-zero when any spec fails.
- `status --name <spec>` — lifecycle, task counts, per-phase task
  list, and verification verdict. Exits non-zero when the spec fails
  verification.
- `discover [--pending | --status <states>] [--verbose]` — lists every
  spec with its derived lifecycle state and task counts. `--pending`
  keeps every unfinished spec; `--status` takes a comma-separated list
  of `pending`, `in-progress`, `blocked`, `complete`, `inconsistent`
  (`completed` is accepted as an alias for `complete`).
- `doctor` — checks `<root>/.agents/skills/` and installs the packaged
  `montflow-create-pi-specs` and `montflow-find-pi-specs` skills
  when missing. Idempotent; resolves the repo root from the working
  directory.

`npx`/`bunx` resolve the workspace `bin` link inside this repo (the root
`devDependencies` entry is what creates it). From a registry
(`npx @montflow/pi-specs` / `bunx @montflow/pi-specs`) the package
must be published first — it is `private` today. The `bin` is a `.ts`
entry with `#!/usr/bin/env bun`, so registry use needs Bun on the
machine; a Node build would be required for `npx` without Bun.

Built with `effect/unstable/cli`. Sample specs for trying the binary
live in [`fixtures/`](fixtures/README.md): `mock-ok` (pending),
`mock-complete` (complete), `mock-stale` (inconsistent), and `mock-bad`
(10 issues across every failure class).

## Library surface

- **`Spec`** — `Spec` Schema Class, `SpecStatus`,
  `WorkspaceType`, `parseSpecFile`, `verifySpecFile`, and the task
  table (`TaskRow`, `parseTaskTable`).
- **`Task`** — `Task` Schema Class, `TaskId`, `TaskType`, `TaskStatus`,
  `parseTaskDirName`, `parseTaskFile`, `verifyTaskFile`, plus the
  task-id / directory / originator patterns.
- **`Gates`** — `parseGates`, `verifyGatesFile` (stages + checklist
  items, no placeholders).
- **`Memory`** — `verifyMemoryFile`, `MEMORY_SECTIONS` (title + template
  sections).
- **`Lifecycle`** — `analyze` / `verify`: derives `pending` /
  `in-progress` / `blocked` / `complete` / `inconsistent` and rejects
  invalid states (e.g. `complete` with pending tasks, all-done but
  `in-progress`, locked phases that are not finished or not a prefix).
  `analyze` takes an optional `active` flag (a live run is bound) to
  split idle `pending` from active `in-progress`.
- **`Structure`** — `verifySpecTree` over an in-memory
  `SpecSnapshot`: required files, task-directory naming and placement,
  id/name agreement, task-table agreement (name/type/status/gates),
  dependency validity (existence, phase order, cycles), one `review` task
  per phase, and `locked-phases` sanity.
- **`Prompt`** — `AUTHOR_PREPROMPT` / `AUTHOR_POSTPROMPT` + `buildAuthorPrompt`
  (author one spec) and `RESUME_PREPROMPT` / `RESUME_POSTPROMPT` +
  `buildResumePrompt` (orchestrate a spec). Each injects its skill.
- **`SpecSkill`** — `AUTHORING_SPEC` / `EXECUTING_SPEC`,
  the simplified skill text sent into dispatched runs (not Pi-discovered).
- **`Verify` / `Frontmatter`** — shared `Issue` / `Result` vocabulary and
  the tolerant frontmatter grammar.
- **`SpecStore`** — filesystem reader (`names`, `hasRoot`, `exists`,
  `snapshot`) backing the CLI.
- **`Cli`** — pure engines (`check`, `status`, `discover`), pure renderers
  (`renderCheck`, `renderStatus`, `renderDiscover`, `resolveDiscoverOptions`),
  and the `effect/unstable/cli` commands.
- **`Doctor`** — `runDoctor(root)` / `runDoctorAt(startDir)` install the
  packaged spec skills into `.agents/skills/`, and report one outcome
  per skill (`SPEC_SKILL_NAMES`).

All verification is pure and non-throwing: it returns a `Result` with an
issue list, so callers can render or repair.

## Status

Early (`0.0.1`, private). Targets the pi-specs spec contract.
Source-only — no build step: Pi loads the `.ts` files directly.
