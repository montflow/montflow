# @montflow/specs

Spec primitives and a CLI for montflow — schema-backed parsing,
mechanical verification, a status panel, and the authoring/executing skill
text injected into dispatched sessions.

## CLI

```bash
# from anywhere in the repo (workspace bin link via the root devDependency)
bunx mf-specs check --name ship-spec
npx mf-specs check --name ship-spec

# or by package script
bun run --cwd packages/specs cli check
```

- `check` — verifies the whole spec root (default
  `.agents/@montflow/specs`) or one `--name`. Token-lean by default
  (failures + summary); `--verbose` also lists passing specs and the
  root. Exits non-zero when any spec fails.
- `status --name <spec>` — lifecycle, task counts, per-phase task
  list, and verification verdict. Exits non-zero when the spec fails
  verification.
- `state --name <spec>` — compact derived state, active phase, and
  locked phases, for an orchestrator to read before acting.
- `next --name <spec>` — the ready task set for the active phase
  (pending tasks whose `depends-on` targets are complete, review last;
  `gated` marks a task with a `GATES.md`).
- `create --name <spec>` — deterministic, model-free scaffold: writes
  `SPEC.md`, one directory per phase holding one directory per `--tasks`
  entry (each `name[:type[:gates]]`, at
  `<PHASE>/<PHASE><NNN>-<name>/`), and the phase's
  `<PHASE>099-review-phase` review task. Refuses to overwrite an existing
  spec. Optional `--description`, `--author`, `--workspace-type
in-place|worktree`. The generated tree passes `check`; edit it to carry the
  real work.
- `migrate --name <spec> | --all [--dry-run]` — moves a flat task directory
  under its phase directory without editing a file. Refuses a mixed tree,
  is a no-op on an already-migrated spec, and verifies the result.
- `list [--pending | --status <states>] [--verbose]` — lists every
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
(`npx @montflow/specs` / `bunx @montflow/specs`) the package
must be published first — it is `private` today. The `bin` is a `.ts`
entry with `#!/usr/bin/env bun`, so registry use needs Bun on the
machine; a Node build would be required for `npx` without Bun.

Built with `effect/cli`. Sample specs for trying the binary
live in [`fixtures/`](fixtures/README.md): `mock-ok` (pending),
`mock-complete` (complete), `mock-stale` (inconsistent), `mock-bad`
(10 issues), and `mock-stray` (stray file, directory, and deep path).

## Library surface

- **`Spec`** — `Spec` Schema Class, `SpecStatus`,
  `WorkspaceType`, `parseSpecFile`, `verifySpecFile`, and the task
  table (`TaskRow`, `parseTaskTable`).
- **`Task`** — `Task` Schema Class, `TaskId`, `TaskType`, `TaskStatus`,
  `parseTaskDirName`, `parseTaskFile`, `verifyTaskFile`, the optional
  `reviewer-profiles` list (`REVIEWER_PROFILES_FIELD`) on a review task, the
  `finding-ref` locator pattern (`FINDING_REF_PATTERN`), plus the task-id /
  directory / originator patterns.
- **`Gates`** — `parseGates`, `verifyGatesFile` (stages + checklist
  items, no placeholders).
- **`Memory`** — `verifyMemoryFile`, `MEMORY_SECTIONS` (title + template
  sections).
- **`Lifecycle`** — `analyze` / `verify`: derives `pending` /
  `in-progress` / `blocked` / `complete` / `inconsistent` and rejects
  invalid states (e.g. `complete` with pending tasks, all-done but
  `in-progress`, locked phases that are not finished or not a prefix).
  `analyze` takes an optional `active` flag (a live session is bound) to
  split idle `pending` from active `in-progress`.
- **`Structure`** — `verifySpecTree` over an in-memory
  `SpecSnapshot`: the phase-directory layout with a strict per-level
  allowlist (root = `SPEC.md` + phase dirs, phase = task dirs, task =
  `TASK.md`/`MEMORY.md`/`GATES.md`), directory entries so an empty or stray
  directory fails, task-directory naming and placement, id/name agreement,
  task-table agreement (name/type/status/gates), dependency validity
  (existence, phase order, cycles), one `review` task per phase, and
  `locked-phases` sanity.
- **`Prompt`** — `AUTHOR_PREPROMPT` / `AUTHOR_POSTPROMPT` + `buildAuthorPrompt`
  (author one spec) and `RESUME_PREPROMPT` / `RESUME_POSTPROMPT` +
  `buildResumePrompt` (orchestrate a spec). Each injects its skill.
- **`Scaffold`** — `renderSpecScaffold` / `ScaffoldSpecInput` /
  `ScaffoldTask`: pure renderer for a fresh spec tree (the mechanical
  half of `mf-specs create`), emitting each review task's
  `reviewer-profiles` list.
- **`SpecSkill`** — `AUTHORING_SPEC` / `EXECUTING_SPEC`,
  the simplified skill text sent into dispatched sessions (not published as
  workspace skills).
- **`Verify` / `Frontmatter`** — shared `Issue` / `Result` vocabulary and
  the tolerant frontmatter grammar.
- **`SpecStore`** — filesystem reader (`names`, `hasRoot`, `exists`,
  `snapshot` including directory entries, `write`, `move`) backing the CLI.
- **`Cli`** — pure engines (`check`, `status`, `list`), pure renderers
  (`renderCheck`, `renderStatus`, `renderList`, `resolveListOptions`),
  and the `effect/cli` commands.
- **`Doctor`** — `runDoctor(root)` / `runDoctorAt(startDir)` install the
  packaged spec skills into `.agents/skills/`, and report one outcome
  per skill (`SPEC_SKILL_NAMES`).

All verification is pure and non-throwing: it returns a `Result` with an
issue list, so callers can render or repair.

## Migration: phase directories

A spec is `SPEC.md` plus one directory per phase, and each phase directory holds
its task directories: `<spec>/<PHASE>/<PHASE><NNN>-<kebab-name>/`. The verifier
enforces that layout at every level and fails on an empty phase directory or a
stray file. Move an existing flat spec with the migrate verb:

1. `mf-specs migrate --name <spec> --dry-run` prints the plan and writes nothing.
2. `mf-specs migrate --name <spec>` renames each task directory under its phase;
   no file content changes.
3. `mf-specs migrate --all` migrates the whole store. A mixed tree (flat task
   directories and phase directories) is refused, and an already-migrated spec
   is a no-op.

## Migration: multi-reviewer reviews

Multi-reviewer support adds an optional `reviewer-profiles` field to a review
task and one review series per declared profile. Existing specs and series need
no change:

1. **No declared profiles is unchanged.** A review task with no
   `reviewer-profiles` (absent, blank, or `[]`) dispatches one general reviewer
   into its existing series, exactly as before. `mf:check:specs` never
   reads review series, so a series-free repo gate keeps passing; the per-series
   link is enforced only by the workspace caller.
2. **`reviewer-profiles: <a>, <b>` is additive.** Each declared profile adds a
   series named `<spec>-<profile>`, and the general reviewer always runs the
   default `<spec>` series alongside it — a profile joins, it never replaces the
   general reviewer. A phase's review lands on the same round number in every
   expected series.
3. **`finding-ref` is now a qualified locator.** A `defect` task's bare
   `finding-ref: F<n>` becomes `<series>/<round>/F<n>` (for example
   `ship-login/002/F2`). The accepted grammar is
   `/^[a-z0-9]+(?:-[a-z0-9]+)*\/\d{3}\/F\d+$/`. Rewrite each existing value
   once; there are none in this repo.
4. **Cross-spec series names can collide — accepted.** Because `-` both
   separates and occurs inside a slug, a profile series `<spec>-<profile>` can
   equal another spec's default or profile series (spec `foo` declaring profile
   `bar` composes `foo-bar`, the default series of a spec named `foo-bar`). No
   injective marker exists within the slug alphabet, and both the verifier and
   dispatch always hold the spec name, so this is accepted as a low-likelihood
   limitation.
5. **Per-round `Phase:` attribution is the binding.** Every spec-phase round
   records the phase it reviews (`- Phase: <phase>` in its `## Metadata`). A
   completed phase review is attributed to a round carrying that phase in every
   expected series, with the round number agreeing across series. The phase rank
   is the _preferred_ round number only: if an earlier phase's fix→re-review
   loop has taken it, the phase writes the next round free in every series. No
   empty or fabricated round is ever seeded, and a `pending` review task
   requires no round at all.

## Status

Early (`0.0.1`, private). Targets the spec contract inherited from the retired Pi toolchain.
Source-only — no build step: the OpenCode host loads the `.ts` files directly.
