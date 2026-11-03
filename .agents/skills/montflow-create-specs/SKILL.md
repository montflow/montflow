---
name: montflow-create-specs
description: Authors a spec under .agents/@montflow/specs/ — SPEC.md plus one directory per phase (PHASE.md, MEMORY.md, BOARD.md) and one directory per task (TASK.md, MEMORY.md, GATES.md, MAILBOX.md) — by scaffolding with `mf-specs init` or `create` then filling in the rules below. Use when an agent must create a spec directly, without dispatching a session.
id: 6ebf45d24cb3d3a1
author: Daniel Montilla
version: 2.13.1
license: MIT
dependencies:
  - executing-skills
groups:
  - planning
---

# When To Use

Use when a new **spec** must be authored under
`.agents/@montflow/specs/<kebab-name>/`. Scaffold the skeleton with the
`mf-specs create` CLI, then fill it in from the rules below. The agent authors
the spec itself — it does not dispatch an authoring session.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

**Prerequisite skill list.** `mf-specs doctor` installs the required
`montflow-create-specs` and `montflow-find-specs` skills. A missing, stale, or
blocked doctor-owned skill fails prompt load with `prompt.skill-missing` /
`prompt.skill-stale` / `prompt.skill-blocked` and the `mf-specs doctor` fix; it is
never downgraded. The execution and sizing prompts also declare
`montflow-adversarial-review`, `montflow-addressing-adversarial-review`,
`executing-skills`, `grilling`, and `i-have-adhd`, which this package does not
ship. A missing one is advisory (`prompt.skill-advisory`): the prompt still
renders and names every missing skill, and only installed skills are handed to
the executor. Install an external skill with
`npx skills add montflow/montflow -s <skill> -y` before relying on its guidance.

# Pipeline

## 0. Choose a Front End

The authoring flow ships as the `spec-create` prompt
(`packages/specs/prompts/spec-create.json`), and that prompt declares this skill.
Point at the prompt; never copy its text into another artifact.

- **Dispatching a session**: `mf-specs author --request "<text>" [--notes "<text>"]`
  loads, gates, renders, and prints the prompt. In the OpenCode host,
  `/specs author …` or the `spec_author` tool dispatches the same text.
- **Authoring here**: scaffold with `mf-specs create` and follow the steps
  below. The artifact contract lives in this skill; the prompt drives the run.

## 1. Choose the Name

`<kebab-name>` becomes the spec directory and equals the `name` in the
frontmatter. Create exactly one spec, then stop. Author the spec; do not
execute it.

## 2. Scaffold the Tree

The tier-aware scaffold is one deterministic, model-free command that reads the
tier contract and writes a tree that already passes `mf-specs check`:

```bash
bun run --cwd packages/specs cli init --name <kebab-name> --tier <tier> \
  [--description "<one line>"] [--author "<name>"] \
  [--workspace-type in-place|worktree] \
  [--phase "<one-line objective>"]... \
  [--task "<PHASE>:<name>:<type>[:<size>][:after=<name,name>]"]... \
  [--review "<PHASE>:required|waived"]... \
  [--review-reason "<PHASE>:<one line>"]... \
  [--reviewer-profiles "<a>,<b>"]
```

`init` refuses a plan that violates the tier's phase range, task ceiling,
exploration rule, gate kind, waiver policy, or review task decision. It writes
the `## Creation` section (`tier`, `questions 0/<budget>`, `unresolved: none`)
and generates a review task exactly for a non-waived phase. Grow the spec with
`mf-specs new-phase --name <spec> --objective <line>` and
`mf-specs new-task --name <spec> --phase <id> --task <kebab-name> --type <type>`;
both allocate the next id from disk. Record a review decision with
`mf-specs waiver --name <spec> --phase <id> --waived --reason <line>` or
`--required`.

`mf-specs create` remains the tier-agnostic mechanical scaffold for a tree that
does not need a tier plan. It writes a tree passing `mf-specs check`:

```bash
bun run --cwd packages/specs cli create --name <kebab-name> \
  [--description "<one line>"] [--author "<name>"] \
  [--workspace-type in-place|worktree] \
  [--tasks "build:execution:gates:large,explore:exploratory"] \
  [--reviewer-profiles "<a>,<b>"]
```

- `<kebab-name>` is required and must be the final directory name.
- Each `--tasks` entry is `name[:type[:gates[:size]]]`. `type` defaults to
  `execution` (one of exploratory | execution | planning | review | interruptor | defect);
  the third token `gates` (or `true`) emits a `GATES.md`; the fourth token
  `size` defaults to `medium` — see step 5.
- With no `--tasks`, it creates one `implement` execution task.
- It places every task under its `<PHASE>/` directory, refuses to overwrite an
  existing spec, and prints the files it wrote. It never appends a review task:
  request one with `name:review` when the phase reviews.
- `--reviewer-profiles` seeds the `reviewer-profiles` list on each requested
  `review` task (comma-separated, ordered).
- Inside the OpenCode host the same engine is
  `/specs create --name <kebab-name> …`.

Then edit the rendered `SPEC.md` and `TASK.md` prose so it carries the real
requirements. The generator owns the verifier-checked fields — task and phase
ids, `status`, `created`, and every timestamp — so never type one by hand.
Grow an existing spec with `mf-specs new-phase` and `mf-specs new-task`; both
allocate the next id from disk. Transition status only with `mf-specs claim`.

## Tier Selection and Loading

The appraiser chooses exactly one tier. The authoring run loads exactly that
tier with `mf-specs tier <tier>` — one positional value, no default, no
directory listing, and no second tier. The table below is the enum summary; the
loaded file is the only place the artifact matrix and the interaction budget are
stated.

| Tier     | Phases | Exploration | Tasks | Review   | Questions |
| -------- | ------ | ----------- | ----- | -------- | --------- |
| micro    | 1      | forbidden   | 2     | waived   | 0         |
| standard | 1–2    | optional    | 6     | required | 2         |
| full     | 2–4    | required    | 12    | required | 8         |

- `Phases` is the inclusive phase range; `Tasks` is the maximum number of work
  tasks, excluding a generated review task.
- `Exploration` is `forbidden` for `micro`, `optional` (at most one exploratory
  task, in the first phase) for `standard`, and `required` as a dedicated phase
  `A` for `full`.
- `Review` is the default decision; the waiver policy is `permitted` for
  `micro`, `records-only` for `standard`, and `forbidden` for `full`.
- `Questions` is the maximum number of `ask_user` calls in one creation run. It
  is recorded in `SPEC.md` as `questions <n>/<budget>`, self-reported and
  advisory; there is no harness counter.
- Anything above `full` is the `split` verdict, not a tier. It carries
  `verdict`, `cut`, `count`, `specs`, `slug`, `tier`, `scope`, and `evidence`,
  and authors nothing.

A plan outside the phase range, the task ceiling, or the exploration rule is
invalid: re-appraise, then split only when the work holds independent concerns.

## 3. Write `SPEC.md`

The generator writes the frontmatter and the task table; edit only the prose.
`name` is the kebab-case directory name, `status: in-progress`,
`workspace-type: in-place`, `author`, and `created` (YYYY-MM-DD) are scaffold
outputs, and there is no lock field.

Body sections: `## Description`, `## Requirements`, `## Tasks`.

`## Tasks` is a table `| ID | Name | Type | Status | Gates |` with `Gates`
either `Yes` or `No`.

## 4. Write the Phase and Task Directories

Every phase is a directory `<PHASE>/` holding `PHASE.md` (objective, status,
review decision, gate kind), `MEMORY.md`, `BOARD.md`, and optionally `GATES.md`
and `GATE-RESULTS.jsonl`. Every task lives at
`<PHASE>/<PHASE_LETTERS><NNN>-<kebab-name>/` containing `TASK.md` and
`MEMORY.md`, plus `GATES.md`, `MAILBOX.md`, and `GATE-RESULTS.jsonl` when the
task needs them. The phase directory is not a pure container: the phase record
and channels live there beside the task directories.

`PHASE.md` frontmatter: `id` (equals the directory), `objective`, `status`
(derived from its tasks), `review` (`required|waived`), optional
`review-reason`/`review-evidence` when waived, and `gate`
(`none|mechanical|subjective`). Write it with `init`/`new-phase`/`waiver`, not
by hand.

`TASK.md` frontmatter: `id` (`<LETTERS><NNN>`, matches the directory), `name`
(matches the directory name after the id), `type`, `originator`, `size`,
`depends-on`, `related-tasks`, `reviewer-profiles`, `status`.

`TASK.md` body sections: `## Type: <type>`, `## Description`,
`## Requirements`, `## Completion`.

- `type`: exploratory | execution | planning | interruptor | defect | review.
- `status`: pending | in-progress | complete | blocked (`defect` is a type, never a status).
- `originator`: `user`, `defect:<task-id>`, or `planner:<task-id>`.
- `depends-on` may reference only tasks in the same phase or an earlier phase.
- `reviewer-profiles` (`review` tasks only): comma-separated ordered reviewer
  profile slugs (`reviewer-profiles: example-reviewer, generic-reviewer`). Empty
  or absent keeps the single general reviewer; each entry adds a
  `<kebab-name>-<profile>` review series that the phase's review round is also
  written to. Read the profiles the repo declares under
  `.agents/@montflow/profiles/` and declare one only when its focus matches the
  phase's work; an empty list is the default and is valid on every phase, and
  each declared profile adds one review round per cycle in that phase, and the phase budget is unchanged by the declaration.

### A Gate Names the Task's Own Commands

`GATES.md` is this task's proof, never a copy of the repo-wide suite: every item
names a command, or a named subjective check, that proves **this** task, so
whoever runs the gate gets a verdict about this task and nothing else.
`mf-specs create` writes one placeholder item,
`- [ ] REPLACE with this task's own verification commands`; replace it with the
real commands and check each box you actually ran. The review removes the
replacement marker; it never deletes the gate.

The `## Completion` checklist and the gate are records, not decoration: a
`complete` task with unchecked completion items fails `task.completion-unchecked`,
and a `complete` task whose gate has no checked item fails `gate.unchecked`. An
unfinished task may carry either an unchecked checklist or an all-unchecked gate
with no finding; the contradiction is the completed status, not the empty box.
`mf-specs check` also verifies the phase review budget from the review series —
more rounds attributed to a phase (`- Phase:` in a round's `## Metadata`) than
the phase budget is an error, not a prose rule.

## 5. Size Every Task

Every task declares `size` in `TASK.md` frontmatter: `tiny`, `small`, `medium`,
or `large`. `mf-specs create` writes `medium`; replace that default with the
size you judge. A missing size fails `mf-specs check` for a `pending`,
`in-progress`, or `blocked` task. A complete task may declare `size: none`
instead: a record-only opt-out that is never a dispatch target and contributes no
model or review budget. `none` is an error on an unfinished task.

Size buys the phase's review-cycle budget:

| Size     | Review cycles |
| -------- | ------------- |
| `tiny`   | 1             |
| `small`  | 2             |
| `medium` | 3             |
| `large`  | 3             |

The hard cap is 3 for every phase. A phase's budget is the largest budget among
its non-review tasks, capped at 3 — a phase of only `tiny` tasks gets exactly 1
review cycle, and the phase's own `review` task never raises the budget. A
non-empty phase always gets at least 1 cycle, so a phase holding only its review
task can still be reviewed. Choose
each size by the risk and review depth the task carries, not by its line count:
the largest task sets how many fix → re-review rounds its phase may spend.

Each size resolves to a dispatch target through optional `sizing.json` config in
two locations, merged as three layers:

1. Repo: `<specs-root>/sizing.json`, default
   `.agents/@montflow/specs/sizing.json`. Repo-wide; `sizes` only.
2. Spec: `<spec>/sizing.json`. `sizes`, plus optional
   `phases.<PHASE>.sizes` overrides.

Both files are optional, and a repo-only file is valid. A size entry is
`{ "model": "provider/model", "effort": "high" }`; `effort` is an optional model
variant and is invalid without `model`.

Layers merge repo → spec → phase, least to most specific, by size: the most
specific layer that defines a size wins the whole entry, and fields are never
partially inherited. A size no layer defines is `inherit` — the dispatcher omits
the `model` argument and the current model runs.

Never invent model ids and never add a `sizing.json` the user did not give you; a
fresh spec is valid with no config at all. Inspect a dispatch target with
`mf-specs sizing --name <kebab-name> --task <id>` — one compact line of id, size,
target, and source — or add `--human` for the task budget, its contribution, the
phase budget, and the size-by-layer matrix. The machine-only
`mf-specs resolve --name <kebab-name> --task <id>` prints the target alone.

**A task's size is yours; a config is generated.** Choosing the size is
authoring. Writing the config entry is not: a spec's `sizing.json` is generated
afterwards from the live harness catalogue through the `spec-sizing` prompt —
`mf-specs sizing-config [--scope repo|spec|phase] [--name <spec>]` in the
binary, `/specs sizing-config` or the `spec_sizing` tool in the host — and the
`spec-sizing-orchestrator` role runs it when the user wants a tuned config.
Never type a model id or an effort into a config by hand: a valid id is only one
the catalogue lists, and an effort is only one that model's known variants list
contains. Read the catalogue through `spec_models` in the host or
`mf-specs models --catalog <path>` outside it; `variants unknown` and
`variants none` both mean no effort.

Omitting `--scope` leaves the layer **open**: the wizard asks which one to write.
The flags only narrow an inferred layer — `--name <spec>` implies the spec layer,
`--name <spec> --phase <PHASE>` implies that phase — while an explicit `--scope`
wins and refuses flags it cannot honour (`--scope repo` takes neither,
`--scope spec` takes no `--phase`). `sizing-config --name` alone never pins a
layer.

Prove a generated config in this order, scoped to what was touched:

1. `mf-specs models --verify` (add `--name <spec>` for the spec layer, and
   `--catalog <path>` outside the host) — every entry must be a catalogue model
   with a known variant. The count line states how many entries were checked and
   skipped.
2. `mf-specs check --name <kebab-name>` — zero issues.
3. `mf-specs sizing --name <kebab-name> --task <id> --human` for one task per
   explicit target — the winning layer must be the one you wrote.

## 6. Follow the Phase Rules

A phase is a directory named `<PHASE>/`; every task directory lives inside its
phase directory, and the phase's own files (`PHASE.md`, `MEMORY.md`,
`BOARD.md`, optional `GATES.md`/`GATE-RESULTS.jsonl`) sit beside them. A phase
either reviews or waives, and the tier sets the default and the waiver policy.
A generated review task exists exactly for a non-waived phase: there is no
reserved review task, so never add one to a waived phase and never require one
where the tier allows a waiver. A phase lock is derived from every task being
complete, every classified mechanical gate being proven, and a closed review
round or an effective waiver; never hand-write a lock or a lock list. Confirm
one with `mf-specs lock --name <spec> --phase <id>` — it writes nothing. Keep
the spec `status: in-progress`; authoring never locks a phase.

## 7. Ask Only When the Decision Is the User's

Ask with `ask_user` only when the decision is theirs — scope, naming, or real
ambiguity; otherwise decide and proceed. The tier's question budget is advisory
and self-reported in `## Creation`; it is never a licence to ask a fact the
repository can answer, and `micro` asks nothing. Use `notify_user` for progress
the user should see. Do not invent extra context.

## 8. Self-Check Before You Stop

Only edit files if you skipped the scaffold or changed the tree by hand; a fresh
`init` or `create` output already verifies.

- The appraiser named `micro`, `standard`, or `full`, or emitted `split`; the
  authoring run loaded exactly that tier with `mf-specs tier <tier>`.
- `SPEC.md` carries `## Creation` with `tier`, self-reported
  `questions <n>/<budget>`, and unresolved decisions or `none`.
- Every task directory matches a row in `## Tasks`, and every row has a directory.
- Each `TASK.md` `id` equals its directory id, and `name` equals the directory name after the id.
- Every task directory lives under its phase directory (`<PHASE>/<task>/`).
- `depends-on` references stay in the same phase or an earlier phase.
- Every unfinished task declares a size: `tiny`, `small`, `medium`, or `large`.
  A complete task may declare `size: none` as a record opt-out.
- The spec is `status: in-progress`; no lock list is written.
- Nothing outside `.agents/@montflow/specs/` was touched.
- `mf-specs check --name <kebab-name>` reports zero issues
  (run `bun run --cwd packages/specs cli check --name <kebab-name>`).
- A dispatch target that looks wrong is explained, not hand-fixed: run
  `mf-specs sizing --name <kebab-name> --task <id> --human` and read the
  winning layer.

# Reference

- **Specs**: `.agents/@montflow/specs/<name>/` — `SPEC.md`, optional
  `sizing.json`, and one directory per phase (`PHASE.md`, `MEMORY.md`,
  `BOARD.md`, optional `GATES.md`/`GATE-RESULTS.jsonl`) holding one directory per
  task (`TASK.md`, `MEMORY.md`, optional `GATES.md`/`MAILBOX.md`/`GATE-RESULTS.jsonl`).
- **Generator verbs**: `init`, `new-phase`, `new-task`, `stamp`, `claim`,
  `waiver`, `tier`, `gate run`, `gate record`, `mail`, and `lock` (confirmation
  only). Every verifier-checked record has one of these as its writer.
- **Tier CLI**: `mf-specs tier <micro|standard|full>` prints exactly one installed tier file from `.agents/@montflow/tiers/<tier>.md`; there is no default, no listing, and no second tier. The files are `packages/specs/tiers/*.md`, installed by `mf-specs doctor`.
- **Scaffold CLI**: `mf-specs init --name <spec> --tier <tier>` is the tier-aware entry; `mf-specs create` (or `/specs create` in the OpenCode host) remains the tier-agnostic scaffold — flags `--name`, `--description`, `--author`, `--workspace-type`, `--tasks` (each `name[:type[:gates[:size]]]`, size defaulting to `medium`), `--reviewer-profiles`.
- **Sizing config**: `<specs-root>/sizing.json` (repo layer) and `<spec>/sizing.json` (spec layer, with `phases.<PHASE>.sizes`); absent size entry means `inherit`.
- **Sizing CLI**: `mf-specs sizing --name <spec> --task <id> [--verbose|--human]` — compact by default (id, size, target, source); `--verbose` / `--human` add the task and phase budgets and the provenance matrix. `mf-specs resolve --name <spec> --task <id>` prints the bare dispatch target; `mf-specs status` / `next` show per-task size, target, and source.
- **Catalogue CLI**: `mf-specs models [--provider <id>] [--json] [--catalog <path>]` lists the models this harness can dispatch and their effort variants (`variants unknown` vs `variants none`); outside the host pass `--catalog <path>` to either form, or use the `spec_models` tool in the host. `mf-specs models --verify [--name <spec>]` cross-checks every config entry, warns `models.unknown-model` / `models.unknown-effort`, and states the entries checked and skipped split by layer and provider.
- **Prompt**: `packages/specs/prompts/spec-create.json` (`spec-create`), doctor-installed into `.agents/@montflow/prompts/`; render it with `mf-specs author --request <text>` or `/specs author` in the host.
- **Sizing prompt**: `packages/specs/prompts/spec-sizing.json` (`spec-sizing`), the wizard the `spec-sizing-orchestrator` role runs; render it with `mf-specs sizing-config` or `/specs sizing-config` / the `spec_sizing` tool. It generates one config layer from the live catalogue and writes nothing before confirmation.
- **Contract source**: `modules/tier`, `modules/init`, `modules/scaffold`, `modules/lifecycle`, `modules/structure`, `modules/sizing`, `packages/specs/tiers/`, and the shipped `spec-create` prompt.
