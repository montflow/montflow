# @montflow/specs

Spec primitives and a CLI for montflow — schema-backed parsing,
mechanical verification, a status panel, and the shipped authoring, execution,
and sizing prompts that `mf-specs author`, `execute`, `sizing-config`, and
`which` render and resolve.

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
  (failures + summary), with every coded warning for a spec on one grouped
  line; `--verbose` also lists passing specs and the
  root, and adds the cause chain and layer trace for sizing findings.
  Exits non-zero when any spec fails.
- `status --name <spec>` — lifecycle, task counts, per-phase task
  list, and verification verdict. Exits non-zero when the spec fails
  verification, including the review budget read from the review store.
- `state --name <spec>` — compact derived state, active phase, and
  locked phases, for an orchestrator to read before acting. Exits non-zero on
  the same dispatch errors `status` reports, and names them: a blocked spec
  appends `· blocked <codes>` and `next mf-specs status --name <spec>` to the
  one-line state, with `--verbose` expanding the full blocker blocks.
- `next --name <spec>` — the ready task set for the active phase
  (pending tasks whose `depends-on` targets are complete, review last;
  `gated` marks a task with a `GATES.md`). Exits non-zero on every error
  `check` reports — config, task size, tree, or review budget — so `status`,
  `next`, and `check` agree.
- `create --name <spec>` — deterministic, model-free scaffold: writes
  `SPEC.md`, one task directory per `--tasks` entry (each
  `name[:type[:gates[:size]]]`, with `size` defaulting to `medium` when the
  token is absent or blank), and the
  phase's `<PHASE>099-review-phase` review task. A fifth token is an error
  rather than silently ignored. Refuses to overwrite an
  existing spec. Optional `--description`, `--author`,
  `--workspace-type in-place|worktree`.
  The generated tree passes `check`; edit it to carry the real work.
- `author --request <text> [--notes <text>]` — loads the `spec-create` prompt
  (gated on `mf-specs doctor`), renders it with the request, and prints it and
  nothing else. Model-free: the binary never dispatches a session.
- `execute [--name <spec>] [--phase <id>] [--focus <text>] [--mode guided|autonomous]`
  — loads the `spec-execute` prompt with the derived state, ready set, and
  review budget, and prints it. An explicit `--name` wins; otherwise it asks
  `which` which spec the checked-out branch names. Derived state drives begin
  versus resume, so one command covers both. `--phase` may only name the active
  phase: a locked or later phase fails `spec.phase-not-active`, and a spec with
  no active phase fails `spec.no-active-phase` instead of rendering a session.
  A blank `--phase` is absent; a padded or otherwise malformed one is
  `cli.invalid-argument`, the same rule `sizing-config` applies.
- `which [--branch <name>] [--dir <path>]` — the mechanical spec resolver:
  prints exactly one spec name and nothing else. On no match or an ambiguous
  match it exits non-zero with the branch it read, every candidate spec, and
  the exact `--name` to pass. `--branch` overrides detection for tests and CI;
  `--dir` defaults to the nearest repository root.
- `models [--provider <id>] [--json] [--catalog <path>] [--verify [--name <spec>]]`
  — the harness model catalogue: one line per model with its effort variants
  (`variants unknown` vs `variants none`) and a `*` on the default. `--json`
  prints the stable, date-free document that is also valid `--catalog` input.
  Without a host catalogue, pass `--catalog`; a bare run fails
  `models.unavailable` and names that flag. `--provider` keeps one provider on
  either action, and a miss is `models.unknown-provider` rather than an empty
  table. A filtered `--json` document carries `"default": null` unless the
  default model itself survives the filter, so the document never points at a
  model it does not list — and it stays valid `--catalog` input. `--verify` cross-checks the repo config, or the named spec's config
  including every phase override, and reports `models.unknown-model` /
  `models.unknown-effort` as warnings because a host catalogue can be partial;
  an unknown variant list never produces an effort finding. With `--verify`,
  `--provider` scopes the checked entries to that provider and an unknown spec
  is `spec.not-found`; `--json` is refused with `cli.invalid-argument` because
  verification has no JSON document. Every `--verify` run ends with one count
  line — entries checked and skipped, split by layer and provider — so a pass
  that checked nothing states its zero instead of printing a bare success. The
  `provider` segment appears only when a filter was applied, so an unfiltered
  run can never be read as a pass filtered to a provider named `all`.
- `sizing-config [--scope repo|spec|phase] [--name <spec>] [--phase <id>] [--focus <text>] [--mode guided|autonomous]`
  — renders the `spec-sizing` wizard for one config layer and prints it. It
  writes no file and dispatches nothing; the wizard confirms before writing.
  With no scope flag the scope is open and the prompt asks. `--name` alone
  implies spec, `--name --phase` implies phase, and `--scope` wins over the
  implication. A missing identifier, a contradictory `--scope`, an unknown
  scope, or an invalid mode exits non-zero with the corrected command.
- `resolve --name <spec> --task <id>` — machine-only: prints exactly the task's
  dispatch target (`provider/model#effort`) or `inherit`, and nothing else.
  Exits non-zero for an unknown spec or task, an invalid config, or a task
  whose size is missing or unknown.
- `sizing --name <spec> --task <id> [--verbose|--human]` — inspects one task's
  size. Default output is one compact line: task id, declared size, effective
  target, and winning layer. `--verbose` and `--human` are the same detailed
  mode: budgets plus a size-by-layer provenance matrix.
- `list [--pending | --status <states>] [--verbose]` — lists every
  spec with its derived lifecycle state and task counts. `--pending`
  keeps every unfinished spec; `--status` takes a comma-separated list
  of `pending`, `in-progress`, `blocked`, `complete`, `inconsistent`
  (`completed` is accepted as an alias for `complete`).
- `doctor` — checks `<root>/.agents/skills/` and
  `<root>/.agents/@montflow/prompts/`, installs the packaged
  `montflow-create-specs` and `montflow-find-specs` skills when
  missing, rewrites them when stale or partial, and installs or refreshes
  `spec-create.json`, `spec-execute.json`, and `spec-sizing.json`. `--check`
  writes nothing and
  reports `ok` / `missing` / `stale` / `blocked` per payload. Repair mode
  distinguishes `installed` (created) from `repaired` (rewrote) and reports a
  `blocked` payload with a coded failure instead of aborting the run. Skill
  repair rewrites only the files the package ships and leaves any other file in
  the directory in place. Idempotent; resolves the repo root from the working
  directory. It never touches any prompt or skill it does not own. The other
  skills the shipped prompts declare are external prerequisites, not doctor
  payloads: see [Prerequisite skills and advisories](#prerequisite-skills-and-advisories).

### Authoring, execution, and sizing prompts

`author`, `execute`, and `sizing-config` render; they do not dispatch. The
binary loads the shipped prompt, gates it on `mf-specs doctor`, renders it from
the spec or flag state, and prints it. Inside the OpenCode host, `/specs author`
/ `/specs execute` / `/specs sizing-config` and the `spec_author` /
`spec_execute` / `spec_sizing` tools dispatch the same rendered text
through `@montflow/prompts`' executor. A missing or stale prompt fails before
anything renders, with the file, the problem, and the `mf-specs doctor` fix.

The `/specs` form validates flags per command. Every verb accepts `--dir` and
`--verbose`, plus the flags its binary counterpart implements; a flag the verb
does not implement is refused with `cli.invalid-argument`, the row of flags it
does accept, and the `next` command to run instead — `/specs execute --scope repo`
points at `/specs sizing-config --scope repo`, and `/specs check --json` at
`/specs models --json`. A flag no verb reads is refused the same way, so a typo
can never parse into silence.

#### Prerequisite skills and advisories

`mf-specs doctor` installs the two skills this package owns and treats them as
required. The shipped prompts also declare skills this package does not ship, and
those are advisory.

Required skills and advisory skills, by prompt:

- `spec-create` requires `montflow-create-specs` and declares no advisory skill.
- `spec-execute` requires `montflow-find-specs`; advisory:
  `montflow-adversarial-review`, `montflow-addressing-adversarial-review`.
- `spec-sizing` requires `montflow-find-specs` and `montflow-create-specs`;
  advisory: `executing-skills`, `grilling`, `i-have-adhd`.

A missing, stale, or blocked **doctor-owned** skill fails prompt load before
anything renders with `prompt.skill-missing`, `prompt.skill-stale`, or
`prompt.skill-blocked`, the skill as `field`, and `mf-specs doctor` as the fix. It
is never downgraded to an advisory.

A missing **non-owned** skill does not fail the load. The prompt renders, the
rendered text ends with a `prompt.skill-advisory` block naming every missing
skill with its install command, and `LoadedPrompt.advisories` carries the same
diagnostics for a caller that reports rather than prints. `LoadedPrompt.skills` —
the list handed to the executor — contains only the declared skills installed in
the workspace, in declaration order. Install one with:

```bash
npx skills add montflow/montflow -s <skill> -y
```

The behavior is deliberate: doctor's ownership boundary stays exactly the two
spec skills and the three prompts it ships, while a fresh workspace with only
`mf-specs doctor` applied can still render every shipped prompt.

`sizing-config` sizes exactly one layer — repo-wide, one spec, or one phase —
and writes nothing itself. With no scope flag the prompt asks which layer;
`--name` alone implies spec, `--name --phase` implies phase, and `--scope` wins
over the implication.

```bash
# render the authoring prompt with the user's request
bun run --cwd packages/specs cli author --request "Ship login"

# begin or resume the spec whose name the current branch names;
# on feat/ship-login this resolves ship-login
bun run --cwd packages/specs cli execute --mode autonomous

# render the sizing wizard for one spec's config, or leave --scope off
# so the wizard asks which layer to size
bun run --cwd packages/specs cli sizing-config --scope spec --name ship-login
```

`--mode` accepts exactly `guided` (the default) and `autonomous`. `guided`
keeps the human in the loop and may ask whenever a decision benefits from it.
`autonomous` asks only for a destructive or irreversible action, a very
dangerous tool call, or a decision the agent genuinely cannot make from the
spec and the evidence; every other decision is recorded in `MEMORY.md`. The
mode changes interaction only — dispatch order, `depends-on`, gates, phase
review, locking, and verification are identical in both.

### Spec detection (`which`)

`execute` without `--name` asks `mf-specs which` which spec the checked-out
branch names, so the branch is the default selector. A branch is
`<prefix>/<feature-name>`: a lowercase conventional prefix — `feat`, `fix`,
`chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `release`, or
`hotfix` — then the feature name after the first `/`, lowercased with `/` and
`_` normalized to `-`. Matching is exact first, then a unique prefix match
between the feature name and a spec name where the shorter name ends at a `-`
boundary: `feat/ship` matches `ship-login`, while `feat/s` matches nothing
because `s` stops inside `spec-optimizations`. A prefix must stop on a segment,
never mid-word. There is no fuzzy, edit-distance, or keyword matching.

A detached HEAD, a branch without a conventional prefix, no candidate, two or
more prefix candidates, or unreadable git metadata all mean "no match". The
command exits non-zero with the branch it read, every candidate spec, and the
exact `--name` to pass. The agent must then ask the user which spec to run and
must never pick one. `--branch <name>` overrides detection for tests and CI,
and detection reads a worktree's `.git` file as well as a plain `.git`
directory.

`npx`/`bunx` resolve the workspace `bin` link inside this repo (the root
`devDependencies` entry is what creates it). From a registry
(`npx @montflow/specs` / `bunx @montflow/specs`) the package
must be published first — it is `private` today. The `bin` is a `.ts`
entry with `#!/usr/bin/env bun`, so registry use needs Bun on the
machine; a Node build would be required for `npx` without Bun.

Built with `effect/cli`. Sample specs for trying the binary
live in [`fixtures/`](fixtures/README.md): `mock-ok` (pending),
`mock-complete` (complete), `mock-stale` (inconsistent), `mock-history` (an
untouched record at its review budget), `mock-over-budget` (one review-budget
error), and `mock-bad`
(10 issues across every failure class).

## Prompt sync

The spec prompts live in two places with one owner:

| Location                                | Role                             |
| --------------------------------------- | -------------------------------- |
| `packages/specs/prompts/<name>.json`    | canonical source, edited by hand |
| `.agents/@montflow/prompts/<name>.json` | installed artifact, never edited |

Edit the package file, then run `mf-specs doctor`; do not hand-edit the
workspace copy. Doctor owns exactly `spec-create.json`, `spec-execute.json`, and
`spec-sizing.json`.
Repair mode installs a missing prompt and overwrites a stale one with the
package bytes; it also rewrites a stale or partial skill, so the fix line
converges. A file inside an installed skill directory that the package does not
ship is left in place, and extra files alone do not make a skill stale.
`--check` writes nothing and reports `ok` / `missing` / `stale` / `blocked`
per file with its source and target paths, so `mf:check:specs` fails on drift
with `Run: mf-specs doctor` as the fix. A condition repair refuses is `blocked`
with its own coded fix, so the hint is never printed for work doctor cannot do.
Any other prompt in that directory — `commit.json`, `effect-review.json`, or a
user prompt — is never read, rewritten, or deleted by doctor.

Both payloads are embedded in the `mf-specs` binary at build time
(`bun run generate:payload` from `skills/` and `prompts/`), so `doctor` works
from the standalone binary with no package checkout beside it. The package
directory still wins when present, and `src/modules/doctor/tests/embedded-payload.test.ts`
fails if the embed drifts from the package.

## Sizing

Every task declares `size` in `TASK.md` frontmatter: `tiny`, `small`, `medium`,
or `large`. A missing size is an error for a `pending`, `in-progress`, or
`blocked` task and only a warning for a `complete` one. The size maps to a
dispatch target through optional `sizing.json` config; no config at all, or an
undefined size, resolves to `inherit`.

### Review budget

Task size also buys the phase's review-cycle budget:

| Size     | Review cycles |
| -------- | ------------- |
| `tiny`   | 1             |
| `small`  | 2             |
| `medium` | 3             |
| `large`  | 3             |

The hard cap is 3 for every phase. A review cycle is one reviewer round in each
review series, not a per-finding attempt: `Max Attempts` stays per finding and
is unchanged. A phase's budget is the largest budget among its non-review
tasks, capped at 3 —
a phase of only `tiny` tasks gets exactly one review cycle, and the phase's own
`review` task never raises its budget. A non-empty phase always gets at least
one cycle, so a phase holding only its review task (or only completed tasks
without sizes) can still be reviewed. `status` and `next` print the phase
budget. Compact `sizing --task` omits it: the default line carries only the task
id, declared size, effective target, and winning layer. `--verbose` or `--human`
prints the labelled budget line — `size budget <task> · contributes <cycles> ·
phase <id> · phase budget <phase>` — so the task's own size budget and the cycles
it adds to its phase are never mistaken for one another; a `review` task always
contributes `0`.

### Config

Two optional files, merged least to most specific:

| File                       | Scope     | Keys                       |
| -------------------------- | --------- | -------------------------- |
| `<specs-root>/sizing.json` | repo-wide | `sizes`                    |
| `<spec>/sizing.json`       | one spec  | `sizes`, optional `phases` |

The repo file is a config file, never a spec directory: `list` and `check` never
treat it as a spec. It has no `phases` key. Placeholder ids throughout — this
repo ships no `sizing.json` of its own:

`.agents/@montflow/specs/sizing.json`, repo-only:

```json
{
  "sizes": {
    "tiny": { "model": "provider/cheap-model" },
    "small": { "model": "provider/small-model" },
    "medium": { "model": "provider/medium-model", "effort": "high" },
    "large": { "model": "provider/large-model", "effort": "max" }
  }
}
```

`.agents/@montflow/specs/ship-login/sizing.json`, a spec override with a phase
override:

```json
{
  "sizes": {
    "large": { "model": "provider/review-model", "effort": "high" }
  },
  "phases": {
    "B": {
      "sizes": {
        "small": { "model": "provider/cheap-model", "effort": "low" }
      }
    }
  }
}
```

`model` is required in every size entry. Its first `/` separates the provider
from the model id; the model part may contain further `/` or `:` (OpenRouter
namespaces, Ollama tags), and no whitespace or `#` is allowed.
`effort` is an optional model variant as the catalogue reports it (`low`,
`medium`, `high`, `xhigh`, `max`, and any host token such as `High`) and is
invalid without `model`. Unknown keys, unknown sizes, malformed model ids,
malformed effort tokens, non-object entries, and malformed phase keys are
errors. A well-formed phase key that matches no phase in the spec is a warning:
the override is unused, not invalid.

### Merge rule

For one size, the most specific layer that defines the entry replaces the whole
entry: phase beats spec beats repo, and fields are never partially inherited. A
phase entry that sets `effort` without `model` is invalid rather than half-used.
A size no layer defines is `inherit`: the dispatcher omits the `model` argument
and the current model runs. A repo-only config is valid with no spec file, and
`status` / `next` report each task's size, target, and source layer so an
orchestrator can dispatch without re-reading config.

### Generating a sizing config

Do not hand-write a config. Generate one layer at a time with the `spec-sizing`
wizard — `mf-specs sizing-config` in the binary, `/specs sizing-config` or the
`spec_sizing` tool in the host — and never type a model id or an effort from
memory. The wizard is a conversation, not a one-shot generator. Its order is
fixed:

1. **Show what exists.** It reads `<specs-root>/sizing.json` verbatim, runs
   `mf-specs list`, and — for a spec or phase target — also
   `mf-specs status --name <spec>` plus `<spec>/sizing.json`, then prints the
   current size → target mapping and every file it found, including "none". No
   question comes before this read.
2. **Resolve the scope.** With no fixed scope it asks for repo-wide, one spec,
   or one phase, using the existing config as the context for the choice, and
   shows the chosen spec's mapping before proposing.
3. **Inventory the catalogue.** It reads `mf-specs models --catalog <path>`
   outside the host (or the `spec_models` `list` action in the host) and uses
   only what that reports. A bare `mf-specs models` needs a host model source;
   without one it fails `models.unavailable`, so pass `--catalog <path>`.
4. **Propose all four sizes.** `tiny`, `small`, `medium`, and `large`, each an
   explicit `provider/model[#effort]` target or an explicit `inherit`, each with
   one line of reasoning and its cost/quality tradeoff.
5. **Confirm.** It shows the exact JSON and the exact path and waits. A
   different non-empty value replacing an existing entry needs a second
   permission; an unchanged entry, an empty entry, and a new file do not.
6. **Write exactly one layer.** Unrelated sizes, `phases` entries, and keys
   survive; a second layer takes a second run.
7. **Prove it.** `models --verify` for the touched scope (with
   `--catalog <path>` outside the host), then `check` for the same scope, then
   `sizing --task <id> --human` for one task per explicit target. A failing
   check blocks the report; the report carries the path, the four-size mapping,
   the catalogue entries used, and every result.

The config is generated from the live catalogue rather than remembered because
the catalogue is the only authority on what this harness can dispatch. A model
id is valid only if the catalogue lists it — `spec_models` in the host,
`mf-specs models --catalog <path>` outside it — and `--json` is stable enough
to round-trip as `--catalog` input. The catalogue only advertises targets a
config can hold: a host id, variant, or default label the sizing grammar
rejects is dropped at the boundary (a known variant list filtered to nothing
stays `variants none`, never `variants unknown`), while a hand-written
`--catalog` file that carries one fails `models.malformed-catalog` instead of
being silently trimmed.
`mf-specs models --verify [--name <spec>]`
cross-checks every config entry against it and reports `models.unknown-model` /
`models.unknown-effort` as warnings, aggregated in one pass. Outside the host,
pass `--catalog <path>`; the binary resolves it against the process directory
while `/specs models` resolves it against the plugin workspace.

**Effort comes from variants.** Each catalogue entry either carries its effort
variants or says it does not know them. `variants unknown` (`null`) and
`variants none` (`[]`) both forbid an effort for that model, and a known list
authorizes only the exact tokens it contains — `high` is not a synonym for
`max`. A model with unknown variants never gets an `effort`, and no token is
ever copied from memory.

**Open versus fixed scope.** No `--scope` leaves the layer open and step 2 asks.
`--name` alone implies spec, `--name --phase` implies phase, and an explicit
`--scope` overrides either implication. An incomplete or contradictory
combination — `--phase` without `--name`, `--scope spec` with `--phase`,
`--scope repo` with an identifier — exits non-zero with the corrected command
instead of guessing a layer. The command renders and writes nothing; the only
write is the agent's post-confirmation edit.

**`inherit` is a decision.** Every size is decided explicitly, and a size with
no reason to differ from the current model is an explicit `inherit`: the
dispatcher omits the `model` argument and the current model runs. The wizard
never fills a size merely to fill the file, and a run that would change nothing
writes nothing. It never edits a task size, a `TASK.md`, `SPEC.md`, or spec
state, and a repo-wide run never adds a `phases` key.

A session, with placeholders for every id. `[wizard]` lines are the agent's
report; the `$` lines are commands it ran:

```text
$ mf-specs sizing-config --name ship-login
[wizard] scope: spec ship-login (fixed by --name); existing config: none, so
         every size is inherit.
[wizard] catalogue:
$ mf-specs models --catalog <path>
provider/cheap-model  variants none
provider/deep-model  variants high,max
provider/standard-model  variants high,low,max  *

[wizard] proposal -> .agents/@montflow/specs/ship-login/sizing.json
  tiny    provider/cheap-model            mechanical edit; no effort, variants none
  small   provider/standard-model#high    bounded change; high is on its list
  medium  provider/standard-model#max     multi-file work; max is on its list
  large   inherit                         no better target than the current model
[wizard] write .agents/@montflow/specs/ship-login/sizing.json? [user: yes]
[wizard] wrote ship-login/sizing.json: sizes only, 2-space JSON, trailing newline
$ mf-specs models --verify --name ship-login --catalog <path>
✓ no model or effort findings

3 entries checked · 0 skipped · repo 0 checked, 0 skipped · spec 3 checked, 0 skipped
$ mf-specs check --name ship-login
1 spec · 0 failed · 0 issues
$ mf-specs sizing --name ship-login --task A002 --human
A002 · declared small · target provider/standard-model#high · source spec
size budget 2 · contributes 2 · phase A · phase budget 2

size    repo    spec                          phase   winner
tiny    absent  provider/cheap-model          absent  spec
small   absent  provider/standard-model#high  absent  spec
medium  absent  provider/standard-model#max   absent  spec
large   absent  -                             absent  inherit
```

### Diagnostics

Every sizing failure renders as one agent-first, greppable block: `code`, `path`,
`field`, `problem`, `expected`, `actual`, `fix`, and `next` naming the command to
re-run. `--verbose` adds the detail rows — `cause` when the failure wraps an
underlying error, the sizing `layers` trace, and a defect's `stack` — so the
default block stays token-lean and the flag means the same thing on every verb.
One diagnostic with every field populated (`--verbose`):

```text
code     sizing.malformed-json
path     ship-login/sizing.json
field    root
problem  Config is not valid JSON.
expected a JSON object with a "sizes" map
actual   unparseable JSON
fix      Rewrite ship-login/sizing.json as valid JSON.
cause    Expected property name or '}' in JSON at position 11 (line 1 column 12)
next     mf-specs check --name ship-login
```

`check` aggregates every sizing error across the repo config, the spec config,
and the task sizes in one pass instead of stopping at the first one — including
an unreadable config file, which becomes a coded `store.error` finding. Every
error keeps its full block. Warning findings group into one line per spec,
carrying every code with its count and a representative path — codes in sorted
order and each path a lexicographic minimum, so the line does not depend on
discovery order — so a historical
backlog stays readable; `check --verbose` expands every group back into its full
block
and adds the cause chain plus a `layers` line for sizing findings (`consulted
repo,spec` plus the winning `layer`, and the `phase` for a nested override or a
task-size finding). `check --strict` promotes warnings, which then render in
full as errors and fail the run. Exit
codes: `0` clean, `1` a validation failure, `2` an internal defect. Every
command catches `Cause`: an unexpected defect renders `code internal` and exits
`2` with its stack only under `--verbose`, while an interruption exits `130`.
`status`, `next`, and `state` gate their target columns and exit non-zero on
every error `check` reports, so a dispatchable target is never printed for a task
the contract calls invalid. They read the same review series `check` reads, so an
over-budget phase also blocks `execute` before it renders a session. Warnings
stay advisory there: `check --strict` promotes them for the gate, and that
promotion is a `check` decision, not dispatch truth, so `status`, `next`, and
`state` never block on a warning.

The record checks are warnings, so historical specs keep passing unchanged:

- `task.completion-unchecked` — a `complete` task whose `## Completion`
  checklist still holds unchecked items; the message names the task file and the
  unchecked count.
- `gate.unchecked` — a `complete` task whose `GATES.md` has no checked item.
- `review.phase-unattributed` — a round in a linked review series with no
  parsable `- Phase:` attribution, so it counts toward no phase budget. A
  warning, promoted by `--strict`, so a dropped or decorated line is never a
  silent exemption.
- `review.budget-exceeded` — an **error**: a review series holds more rounds
  attributed to a phase (`- Phase:` in a round's `## Metadata`) than that phase's
  size-derived budget. The message names the series, phase, budget, and actual
  count. `check` reads the review store beside the specs store
  (`<specs-root>/../reviews`); a spec with no series is skipped, so a historical
  record never turns red for predating the store, while a round file it cannot
  read is a `store.error` instead of a silently uncounted round. The execute
  prompt's review-cycle cap is therefore mechanical, not prose.

## Library surface

- **`Spec`** — `Spec` Schema Class, `SpecStatus`,
  `WorkspaceType`, `parseSpecFile`, `verifySpecFile`, and the task
  table (`TaskRow`, `parseTaskTable`).
- **`Task`** — `Task` Schema Class, `TaskId`, `TaskType`, `TaskStatus`,
  the optional `size` field, `parseTaskDirName`, `parseTaskFile`,
  `verifyTaskFile`, `verifyTaskSize`, `verifyTaskCompletion` (a complete task
  with unchecked `## Completion` items is `task.completion-unchecked`), the
  optional
  `reviewer-profiles` list (`REVIEWER_PROFILES_FIELD`) on a review task, the
  `finding-ref` locator pattern (`FINDING_REF_PATTERN`), plus the task-id /
  directory / originator patterns.
- **`Gates`** — `parseGates`, `verifyGatesFile` (stages + checklist
  items, no placeholders), and `verifyGateProgress` (a complete task with no
  checked gate item is `gate.unchecked`).
- **`Memory`** — `verifyMemoryFile`, `MEMORY_SECTIONS` (title + template
  sections).
- **`Lifecycle`** — `analyze` / `verify`: derives `pending` /
  `in-progress` / `blocked` / `complete` / `inconsistent` and rejects
  invalid states (e.g. `complete` with pending tasks, all-done but
  `in-progress`, locked phases that are not finished or not a prefix).
  `analyze` takes an optional `active` flag (a live session is bound) to
  split idle `pending` from active `in-progress`.
- **`Structure`** — `verifySpecTree` over an in-memory
  `SpecSnapshot`: required files, task-directory naming and placement,
  id/name agreement, task-table agreement (name/type/status/gates), the
  record checks, dependency validity (existence, phase order, cycles), one
  `review` task per phase, and `locked-phases` sanity. Its review input is
  required (`NO_REVIEW` when the caller has no store), so every surface that
  verifies a tree also fails a series holding more rounds for a phase than that
  phase's budget.
- **`ReviewLink`** — the review-series convention: `seriesName`,
  `profileSeriesName`, `seriesNames`, `roundForPhase`, `roundPhase`,
  `reviewPhases`, `verify` (a complete review has its round), and
  `verifyBudgets` (a series at or under its phase budget; over is
  `review.budget-exceeded`, and a round with no parsable attribution is the
  `review.phase-unattributed` warning).
- **`Prompt`** — `load(root, name, values)`: gate the shipped template on
  `mf-specs doctor`, read and verify it through `@montflow/prompts`, render it
  with the caller's values, and return the text plus the installed skills, the
  `SkillAdvisory` items for missing non-owned declared skills, and the decoded
  prompt. `PROMPT_NAMES` is `spec-create`, `spec-execute`, and `spec-sizing`, and
  the templates live only in `packages/specs/prompts/`. `parseMode` / `MODES`
  carry the public `guided` (default) and `autonomous` names.
- **`Scaffold`** — `renderSpecScaffold` / `ScaffoldSpecInput` /
  `ScaffoldTask`: pure renderer for a fresh spec tree (the mechanical
  half of `mf-specs create`), emitting each task's `size` and each review
  task's `reviewer-profiles` list.
- **`Sizing`** — the single size vocabulary (`SIZES`, `Size`, `isSize`,
  `DEFAULT_SIZE`), the review-cycle budget (`REVIEW_CYCLES`,
  `MAX_REVIEW_CYCLES`, `reviewCycles`, `taskContribution`,
  `phaseReviewBudget`), the coded verifier
  (`verify`, `verifyText`), the effectful `parse` with preserved cause, and the
  layered resolver (`LAYERS`, `merge`, `mergedEntry`, `resolve`, `targetOf`,
  `INHERIT`).
- **`Catalogue`** — the harness model catalogue: `normalize`, `filterProvider`,
  `findModel`, `toDocument` / `toJson`, `renderTable`, `decode`, and `verify`
  (`models.unknown-model` / `models.unknown-effort` findings plus the stable
  code list). The only normalizer the `models` command and the sizing flow use.
- **`Verify` / `Frontmatter`** — shared `Issue` / `Result` vocabulary and
  the tolerant frontmatter grammar.
- **`Diagnostic`** — `DiagnosticBlock`, `renderDiagnostic` /
  `renderDiagnostics`, and `causeMessage`: the one agent-first block
  (`code`, `path`, `field`, `problem`, `expected`, `actual`, `fix`,
  `next`, plus `cause`, `layers`, and `stack` under `--verbose`) every surface
  prints through, CLI and prompt advisories alike.
- **`SpecStore`** — filesystem reader (`names`, `hasRoot`, `exists`,
  `snapshot`, `reviewSeries`) backing the CLI. `reviewSeries` reads the review
  store beside the specs store (`<specs-root>/../reviews`) for the series a
  spec owns.
- **`Cli`** — pure engines (`check`, `status`, `list`, `sizingOf`, `models`,
  `listModels`, `verifyModels`, `author`,
  `execute`, `sizingConfig`, `resolveSizingScope`, `which`), pure renderers
  (`renderCheck`, `renderStatus`,
  `renderNext`, `renderList`, `renderSizing`, `renderSizingReport`,
  `renderModelFindings`, `renderWhich`), and the `effect/cli` commands.
  `renderDiagnostic` is `Diagnostic`'s, re-exported here.
- **`Doctor`** — `runDoctor(root)` / `runDoctorAt(startDir)` install the
  packaged spec skills into `.agents/skills/` and the packaged spec prompts
  into `.agents/@montflow/prompts/`, reporting one outcome per skill and prompt
  (`SPEC_SKILL_NAMES`, `SPEC_PROMPT_NAMES`). Repair mode refreshes a stale
  prompt from the package bytes; `--check` writes nothing.

All verification is pure and non-throwing: it returns a `Result` with an
issue list, so callers can render or repair.

## Migration: multi-reviewer reviews

Multi-reviewer support adds an optional `reviewer-profiles` field to a review
task and one review series per declared profile. Existing specs and series need
no change: profiles are declared by the repo and optional per phase, and nothing
in this package recommends one.

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
