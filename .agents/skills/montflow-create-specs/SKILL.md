---
name: montflow-create-specs
description: Authors a spec under .agents/@montflow/specs/ — SPEC.md plus one directory per task (TASK.md, MEMORY.md, GATES.md) — by scaffolding with `mf-specs create` then filling in the rules below. Use when an agent must create a spec directly, without dispatching a session.
id: 6ebf45d24cb3d3a1
author: Daniel Montilla
version: 2.10.0
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

## 2. Scaffold the Tree with `mf-specs create`

The mechanical skeleton is one deterministic, model-free command that already
writes a tree passing `mf-specs check`:

```bash
bun run --cwd packages/specs cli create --name <kebab-name> \
  [--description "<one line>"] [--author "<name>"] \
  [--workspace-type in-place|worktree] \
  [--tasks "build:execution:gates:large,explore:exploratory"] \
  [--reviewer-profiles "<a>,<b>"]
```

- `<kebab-name>` is required and must be the final directory name.
- Each `--tasks` entry is `name[:type[:gates[:size]]]`. `type` defaults to
  `execution` (one of exploratory | execution | planning | interruptor | defect);
  the third token `gates` (or `true`) emits a `GATES.md`; the fourth token
  `size` defaults to `medium` — see step 5.
- With no `--tasks`, it creates one `implement` execution task.
- It always appends the phase's `<PHASE>099-review-phase` review task, refuses
  to overwrite an existing spec, and prints the files it wrote.
- `--reviewer-profiles` seeds the review task's `reviewer-profiles` list
  (comma-separated, ordered).
- Inside the OpenCode host the same engine is
  `/specs create --name <kebab-name> …`.

Then edit the rendered `SPEC.md` and `TASK.md` files so they carry the real
requirements. If you write the files by hand instead, follow steps 3–6 exactly.

## 3. Write `SPEC.md`

Frontmatter: `name` (kebab-case, equals the directory), `status: in-progress`,
`workspace-type: in-place`, `author`, `created` (YYYY-MM-DD), `locked-phases:`
(empty).

Body sections: `## Description`, `## Requirements`, `## Tasks`.

`## Tasks` is a table `| ID | Name | Type | Status | Gates |` with `Gates`
either `Yes` or `No`.

## 4. Write One Directory per Task

`<PHASE_LETTERS><NNN>-<kebab-name>/` containing `TASK.md` and `MEMORY.md`, plus
`GATES.md` when the task's `Gates` is `Yes`.

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
`complete` task with unchecked completion items warns `task.completion-unchecked`,
and a `complete` task whose gate has no checked item warns `gate.unchecked`.
`mf-specs check` also verifies the phase review budget from the review series —
more rounds attributed to a phase (`- Phase:` in a round's `## Metadata`) than
the phase budget is an error, not a prose rule.

## 5. Size Every Task

Every task declares `size` in `TASK.md` frontmatter: `tiny`, `small`, `medium`,
or `large`. `mf-specs create` writes `medium`; replace that default with the
size you judge. A missing size fails `mf-specs check` for a `pending`,
`in-progress`, or `blocked` task; only a `complete` task may omit it.

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

A phase is the leading letters of a task id (`A001` is phase `A`). End every
phase with exactly one `review` task named `<PHASE>099-review-phase`. Leave
`locked-phases:` empty and the spec `status: in-progress`.

## 7. Ask Only When the Decision Is the User's

Ask with `ask_user` only when the decision is theirs — scope, naming, or real
ambiguity; otherwise decide and proceed. Use `notify_user` for progress the user
should see. Do not invent extra context.

## 8. Self-Check Before You Stop

Only edit files if you skipped the `create` scaffold or changed the tree by
hand; a fresh `create` output already verifies.

- Every task directory matches a row in `## Tasks`, and every row has a directory.
- Each `TASK.md` `id` equals its directory id, and `name` equals the directory name after the id.
- Each phase ends with exactly one `<PHASE>099-review-phase` review task.
- `depends-on` references stay in the same phase or an earlier phase.
- Every task declares a size: `tiny`, `small`, `medium`, or `large`.
- `locked-phases:` is empty and the spec is `status: in-progress`.
- Nothing outside `.agents/@montflow/specs/` was touched.
- `mf-specs check --name <kebab-name>` reports zero issues
  (run `bun run --cwd packages/specs cli check --name <kebab-name>`).
- A dispatch target that looks wrong is explained, not hand-fixed: run
  `mf-specs sizing --name <kebab-name> --task <id> --human` and read the
  winning layer.

# Reference

- **Specs**: `.agents/@montflow/specs/<name>/` — `SPEC.md` plus one directory per task (`TASK.md`, `MEMORY.md`, `GATES.md`).
- **Scaffold CLI**: `mf-specs create` (or `/specs create` in the OpenCode host) — flags `--name`, `--description`, `--author`, `--workspace-type`, `--tasks` (each `name[:type[:gates[:size]]]`, size defaulting to `medium`), `--reviewer-profiles`.
- **Sizing config**: `<specs-root>/sizing.json` (repo layer) and `<spec>/sizing.json` (spec layer, with `phases.<PHASE>.sizes`); absent size entry means `inherit`.
- **Sizing CLI**: `mf-specs sizing --name <spec> --task <id> [--verbose|--human]` — compact by default (id, size, target, source); `--verbose` / `--human` add the task and phase budgets and the provenance matrix. `mf-specs resolve --name <spec> --task <id>` prints the bare dispatch target; `mf-specs status` / `next` show per-task size, target, and source.
- **Catalogue CLI**: `mf-specs models [--provider <id>] [--json] [--catalog <path>]` lists the models this harness can dispatch and their effort variants (`variants unknown` vs `variants none`); outside the host pass `--catalog <path>` to either form, or use the `spec_models` tool in the host. `mf-specs models --verify [--name <spec>]` cross-checks every config entry, warns `models.unknown-model` / `models.unknown-effort`, and states the entries checked and skipped split by layer and provider.
- **Prompt**: `packages/specs/prompts/spec-create.json` (`spec-create`), doctor-installed into `.agents/@montflow/prompts/`; render it with `mf-specs author --request <text>` or `/specs author` in the host.
- **Sizing prompt**: `packages/specs/prompts/spec-sizing.json` (`spec-sizing`), the wizard the `spec-sizing-orchestrator` role runs; render it with `mf-specs sizing-config` or `/specs sizing-config` / the `spec_sizing` tool. It generates one config layer from the live catalogue and writes nothing before confirmation.
- **Contract source**: `modules/scaffold`, `modules/lifecycle`, `modules/structure`, `modules/sizing`, and the shipped `spec-create` prompt.
