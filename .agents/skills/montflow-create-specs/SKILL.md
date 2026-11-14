---
name: montflow-create-specs
description: Authors a spec under .agents/@montflow/specs/ — SPEC.md plus one directory per phase (PHASE.md, MEMORY.md, BOARD.md) and one directory per task (TASK.md, MEMORY.md, GATES.md, MAILBOX.md) — by scaffolding with `mf-specs init` or `create` then filling in the rules below. Use when an agent must create a spec directly, without dispatching a session.
id: 6ebf45d24cb3d3a1
author: Daniel Montilla
version: 2.19.0
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
ship. The `spec-create` prompt also declares `using-git-worktrees`, which the
isolated branch loads; a missing one is advisory (`prompt.skill-advisory`): the
prompt still renders and names every missing skill, and only installed skills
are handed to the executor. Install an external skill with
`npx skills add montflow/montflow -s <skill> -y` before relying on its guidance.

# Pipeline

## 0. Choose a Front End

The authoring flow ships as the `spec-create` prompt
(`packages/specs/prompts/spec-create.json`), and that prompt declares this skill.
Point at the prompt; never copy its text into another artifact.

- **Dispatching a session**: `mf-specs author --request "<text>" --rigor <level> --isolated <yes|no> [--notes "<text>"]`
  loads, gates, renders, and prints the prompt. Pass the isolation answers
  (`--origin`, `--worktree-name`, and `--origin-branch` when origin is `other`)
  only for `--isolated yes`. In the OpenCode host, `/specs author …` or the
  `spec_author` tool dispatches the same text.
- **Authoring here**: scaffold with `mf-specs create` and follow the steps
  below. The artifact contract lives in this skill; the prompt drives the run.

## 0. Ask the Authoring Questions

Ask the questions the `spec-create` prompt declares, in this order. A hidden
question is never asked, and a hidden answer is dropped.

| #   | Name            | Type     | Options                                            | Required | When           |
| --- | --------------- | -------- | -------------------------------------------------- | -------- | -------------- |
| 1   | `request`       | textarea | —                                                  | yes      | always         |
| 2   | `notes`         | textarea | —                                                  | no       | always         |
| 3   | `rigor`         | select   | `trivial`, `light`, `standard`, `deep`, `critical` | yes      | always         |
| 4   | `isolated`      | select   | `yes`, `no`                                        | yes      | always         |
| 5   | `origin`        | select   | `current`, `main`, `other`                         | yes      | `isolated=yes` |
| 6   | `origin_branch` | text     | —                                                  | yes      | `origin=other` |
| 7   | `worktree_name` | text     | —                                                  | yes      | `isolated=yes` |

The user selects `rigor`; it has no default. The appraiser recommends a level
and must flag a request the chosen level cannot hold, but it never chooses or
overrides. The prompt file is the source of truth; this table must match it.

## 1. Choose the Name

`<kebab-name>` becomes the spec directory and equals the `name` in the
frontmatter. Create exactly one spec, then stop. Author the spec; do not
execute it.

## 2. Scaffold the Tree

The rigor-aware scaffold is one deterministic, model-free command that reads the
rigor contract and writes a tree that already passes `mf-specs check`:

```bash
bun run --cwd packages/specs cli init --name <kebab-name> --rigor <rigor> \
  [--description "<one line>"] [--author "<name>"] \
  [--workspace-type in-place|worktree] \
  [--phase "<one-line objective>"]... \
  [--task "<PHASE>:<name>:<type>[:<size>][:after=<name,name>]"]... \
  [--review "<PHASE>:required|waived|none"]... \
  [--review-reason "<PHASE>:<one line>"]... \
  [--reviewer-profiles "<a>,<b>"]
```

`init` refuses a plan that violates the rigor's phase range, task ceiling,
exploration rule, gate kind, waiver policy, or review task decision. It writes
the `## Creation` section (`rigor`, `questions 0/<budget>`, `unresolved: none`)
and generates a review task exactly for a `review: required` phase; a phase may
instead declare `review: none` and hold no review at all. Grow the spec with
`mf-specs new-phase --name <spec> --objective <line>` and
`mf-specs new-task --name <spec> --phase <id> --task <kebab-name> --type <type>`;
both allocate the next id from disk. Record a review decision with
`mf-specs waiver --name <spec> --phase <id> --waived --reason <line>` or
`--required`, or author `review: none` with `new-phase --review none`.

`mf-specs create` remains the rigor-agnostic mechanical scaffold for a tree that
does not need a rigor plan. It writes a tree passing `mf-specs check`:

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

## Rigor Selection and Loading

The user chooses exactly one rigor, `trivial`, `light`, `standard`, `deep`, or
`critical`, with no default. The appraiser recommends a level and flags a
request the chosen level cannot hold; it never chooses, upgrades, or overrides.
The authoring run loads exactly the user's rigor with `mf-specs rigor <rigor>` — one positional value, no default, no
directory listing, and no second rigor. The table below is the enum summary; the
loaded file is the only place the artifact matrix and the interaction budget are
stated.

| Rigor    | Phases | Exploration | Tasks | Review   | Questions |
| -------- | ------ | ----------- | ----- | -------- | --------- |
| trivial  | 1      | forbidden   | 2     | waived   | 0         |
| light    | 1      | optional    | 4     | waived   | 1         |
| standard | 1–2    | optional    | 6     | required | 2         |
| deep     | 2–3    | required    | 9     | required | 4         |
| critical | 2–4    | required    | 12    | required | 8         |

- `Phases` is the inclusive phase range; `Tasks` is the maximum number of work
  tasks, excluding a generated review task.
- `Exploration` is `forbidden` for `trivial`, `optional` (at most one
  exploratory task in phase `A`) for `light` and `standard`, and `required` for
  `deep` (one exploratory task in phase `A`) and `critical` (a dedicated
  exploration phase `A`).
- `Review` is the default decision; the waiver policy is `permitted` for
  `trivial` and `light`, `records-only` for `standard` and `deep`, and
  `forbidden` for `critical`.
- `Questions` is the maximum number of `ask_user` calls in one creation run. It
  is recorded in `SPEC.md` as `questions <n>/<budget>`, self-reported and
  advisory; there is no harness counter.
- Anything above `critical` is the `split` verdict, not a rigor. It carries
  `verdict`, `cut`, `count`, `specs`, `slug`, `tier`, `scope`, and `evidence`,
  and authors nothing.

A plan outside the phase range, the task ceiling, or the exploration rule is
invalid: re-appraise, then split only when the work holds independent concerns.

## Isolated Authoring

When the user selects `isolated: yes`, load the `using-git-worktrees` skill and
follow its pipeline. Resolve the chosen `origin` to a real git ref first — the
skill's `BASE` must pass `git rev-parse --verify`, so never pass the enum:

- `current` → `git branch --show-current`. A detached HEAD has no branch: stop
  and report `isolated: no (requested yes, origin current unresolved: detached
HEAD)`; author nothing.
- `main` → run `git fetch origin`, then pass `origin/main`.
- `other` → pass the `origin_branch` only after `git rev-parse --verify`
  succeeds; an unverifiable branch is a stop, not a guess.

Give the skill its fixed parameters too: Type `feat`, Push `false`, branch
`feat/<worktree_name>`, and path `.worktrees/feat/<worktree_name>`. Never ask
about type or push and never push a branch unless the user asked for it. Never
run `git worktree add` yourself. The skill owns Step 0: if the run is already in
a linked worktree, create nothing and author in that workspace instead of
nesting another. If `using-git-worktrees` is not installed, stop and report
`isolated: no (requested yes, skill missing)`; author nothing in place.

The skill reports `Worktree ready at <abs-path>`. Make that path the run's
workspace root, so every generator path resolves there, and scaffold with
`--workspace-type worktree`. If creation is denied or the skill refuses, stop
and report `isolated: no (requested yes, creation denied)` with the skill's
reason; author nothing and never fall back to the current checkout. When
`isolated` is `no`, author in the current checkout with
`--workspace-type in-place` and create no separate workspace.

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
(derived from its tasks), `review` (`required|waived|none`), optional
`review-reason`/`review-evidence` when waived, and `gate`
(`none|mechanical|subjective`). A `review: none` phase holds no review task and
locks on completion plus gate proof alone. Write it with `init`/`new-phase`/
`waiver`, not by hand.

### Author the Widest Ready Set

Plan every phase as a **ready set, not a queue**: list the tasks that can run at
once, and give each one a declared `write-scope:`. For the contract, every
unfinished task declares `write-scope:` or `none`, and two tasks whose scopes
overlap are joined by a `depends-on` edge or split into different phases.

- `depends-on` carries only a **real** data or ordering dependency — a task that
  consumes another's output, or an order the work must follow. "Same area" or
  "feels sequential" is not a dependency; the default phase shape is every
  non-review task independent of its siblings.
- A serial chain is a **stated decision**, not a fallback. When a phase really
  is sequential, say why in `PHASE.md` with `serial-reason: <one line>`;
  otherwise it is a serial chain with no reason, which the contract reports as
  `phase.serial-chain-unexplained` and the review rejects.
- Name the **waves** while planning. Wave 1 runs together, wave 2 waits only on
  wave 1, and the phase costs roughly the longest wave, not the sum of its
  tasks. A phase authored as one task per wave pays every dispatch serially; if
  a task only needs an earlier artifact at its end, start it in the earlier
  wave and let it finish against that artifact.
- `write-scope:` is a comma-separated list of repo-root-relative POSIX paths:
  an optional trailing `/` names a subtree, `.` names the whole repo, and `none`
  names no files. The task directory is implicit and never declared. Overlapping
  scopes with no `depends-on` edge between the tasks are the contract's
  `phase.write-scope-overlap` error; fix it by adding the real edge or by
  **splitting the phase** so the colliding tasks run in different phases.
  Overlap that paths cannot express is the author's and the reviewer's judgment.
- `depends-on` may reference only a task in the same phase or an earlier one, so
  the widest ready set lives inside the phase and a true prerequisite becomes an
  edge, never a channel message.

### Every New Phase Gets an Execution Brief

Write a `## Execution Brief` section in each new phase's `MEMORY.md` while
authoring. It is the phase's whole context packet, and every worker dispatch
reads it instead of reconstructing context:

- **Read**: the phase `MEMORY.md` `## Execution Brief`, the task's
  `TASK.md`/`GATES.md`, and only the source paths the brief names — never a
  broad grep over generated payloads, lockfiles, or other tasks' records.
- **Write scope**: the task's directory and only the files its `TASK.md` names;
  record writes go to the task `MEMORY.md`.
- **Gate**: point at the task or phase `GATES.md`. `GATES.md` is the sole owner
  of executable commands: a command appears exactly once, on a `command:` line
  of the gate that runs it, and the brief never carries a runnable command. A
  task gate names the task's own commands; a phase-shared or repo-wide check is
  named once in the phase gate and never copied into a task. The worker runs
  scoped checks; the orchestrator runs each gate once, and the scheduler reuses
  an unchanged pass.
- **Record**: the worker `MEMORY.md` stays at or under 80 lines with the fixed
  section set (Context, Progress, Findings, Gates, Open Questions, Handoff,
  Deviations); full logs go to `/tmp/<task-id>.log` and are referenced, never
  pasted.
- **Review**: batch every open finding into one fixer attempt and one re-review,
  keyed off `mf-specs review decide`.

`mf-specs check` reports `phase.execution-brief-missing` as a warning for a v2
`in-progress` phase whose `MEMORY.md` lacks the section or whose section does
not name the five elements (Read, Write scope, Gate, Record, Review): a heading
alone or a stub is not a brief. `mf-specs lock` refuses a started phase without
a valid brief, with the same code and a fix line. A complete or frozen phase is
exempt, so a phase that was already underway when the contract landed does not
need a retroactive brief. Give every pending task a short `## Execution` section
that points at the phase brief instead of repeating it, and keep the brief one
line per bullet.

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
  written to. Before choosing, run `mf-profiles list` and read each profile's
  description — never guess the store's contents; when a description does not
  settle the choice, run `mf-profiles show <name>` for that profile's
  instructions and review checklist. Declare a profile only when its focus
  matches the phase's work; an empty list is the default and is valid on every
  phase, and each declared profile adds one review round per cycle in that
  phase, and the phase budget is unchanged by the declaration. A phase is not
  required to carry a review task: a small phase whose tasks are fully gated
  may end at its gates, and the waiver reason is recorded (B004 decides the
  file and field that carry it).

### A Gate Names the Task's Own Commands

`GATES.md` is this task's proof, never a copy of the repo-wide suite: every item
names a command, or a named subjective check, that proves **this** task, so
whoever runs the gate gets a verdict about this task and nothing else. A task
gate names this task's own commands; an infrastructure task whose subject _is_
the repo-wide gate may name it, and it still runs once, at the orchestrator's
task gate. `mf-specs create` writes one placeholder item,
`- [ ] REPLACE with this task's own verification commands`; replace it with the
real commands and check each box you actually ran. The review removes the
replacement marker; it never deletes the gate. A command appears exactly once,
in a `command:` line of the gate that runs it, so the same suite is not re-run
to rebuild the same evidence; the phase `## Execution Brief` never carries a
runnable command and only points at the gate.

The `## Completion` checklist and the gate are records, not decoration: a
`complete` task with unchecked completion items fails `task.completion-unchecked`,
and a `complete` task whose gate has no checked item fails `gate.unchecked`. An
unfinished task may carry either an unchecked checklist or an all-unchecked gate
with no finding; the contradiction is the completed status, not the empty box.
A completion item names only what this task's own gate proves. Never put a
repo-wide suite in a task checklist: it belongs to the phase gate, runs once at
the phase boundary, and a task item demanding it forces a second heavyweight run
mid-phase. `mf-specs check` also verifies the phase review budget from the review
series — more rounds attributed to a phase (`- Phase:` in a round's `## Metadata`)
than the phase budget is an error, not a prose rule.

### Two Gate Layers

A spec has exactly two gate layers, and every check belongs to one of them:

- **Task layer** — `<task>/GATES.md`: commands scoped to that task's
  `write-scope:` and proof of that task alone. A task gate never names a
  repo-wide suite or a check another task also needs.
- **Phase layer** — `<PHASE>/GATES.md`: the phase-shared and repo-wide checks
  that prove several tasks at once. Name each once, with `scope:` (a
  repo-root-relative path list or `repo`) and `lane: heavy|light` when the
  default classification is wrong. The orchestrator runs the phase gate once at
  the phase boundary; `gate run` keys the run by command, scope, and file
  fingerprint, so a later requester reuses an unchanged pass.

A check that would appear in two task gates is phase-shared: move it to the
phase gate and let each task point at that one entry. A phase-shared or
repo-wide check is named once, in the phase `GATES.md`, never copied into a task
gate. `check` reports `gate.shared-check-in-task` when a task stage's scope is not
contained in the task's `write-scope:`, `gate.duplicate-command` when one command
with overlapping scope appears in two gates, and `gate.scope-missing` when an
unfinished v2 mechanical stage has no resolvable scope.

### Channels and the Scheduler

`BOARD.md` is the phase broadcast channel (`mail --to all`): phase boundaries, a
shared check that ran or was reused, a closed dependency, lane config.
`MAILBOX.md` is a targeted task channel (`mail --to <task-id>`): one task
addressee. The orchestrator is the sole channel writer. A worker reads the phase
`BOARD.md` and its own `MAILBOX.md` at the start and again before its receipt,
and a channel never substitutes for a `depends-on` edge.

`gate run` is scheduled, not merely executed. Its key is `gate-v1:` over the
normalized command, the sorted scopes, and a fingerprint of every file those
scopes cover. One attempt per key runs at a time; a matching pass is reused
(`--no-reuse` forces a run), and a failed, timed-out, or cancelled result is
never reused as a pass. The heavy lane defaults to one run at a time and light
checks never wait behind it, while both count toward the in-flight cap in
`.agents/@montflow/gate.json`. That is why one phase-shared check costs one run
for the whole phase instead of one per worker.

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
reviews, waives, or holds no review at all; the rigor sets the default and the
waiver policy. A generated review task exists exactly for a `review: required`
phase: never add one to a waived or `review: none` phase and never require one
where the rigor allows a waiver. A phase lock is derived from every task being
complete, every classified mechanical gate being proven, and a closed review
round, an effective waiver, or a `review: none` decision; never hand-write a
lock or a lock list. Confirm one with `mf-specs lock --name <spec> --phase <id>`
— it writes nothing. Keep the spec `status: in-progress`; authoring never locks
a phase.

## 7. Ask Only When the Decision Is the User's

Ask with `ask_user` only when the decision is theirs — scope, naming, or real
ambiguity; otherwise decide and proceed. The rigor's question budget is advisory
and self-reported in `## Creation`; it is never a licence to ask a fact the
repository can answer, and `trivial` asks nothing. Use `notify_user` for progress
the user should see. Do not invent extra context.

## 8. Self-Check Before You Stop

Only edit files if you skipped the scaffold or changed the tree by hand; a fresh
`init` or `create` output already verifies.

- The user chose one of `trivial`, `light`, `standard`, `deep`, or `critical`, or
  the appraiser emitted `split`; the authoring run loaded exactly that rigor with
  `mf-specs rigor <rigor>`.
- An isolated run resolved the origin to a real ref, loaded
  `using-git-worktrees`, authored in the workspace it reported, and passed
  `--workspace-type worktree`; an in-place run passed `--workspace-type in-place`.
- `SPEC.md` carries `## Creation` with `rigor`, self-reported
  `questions <n>/<budget>`, and unresolved decisions or `none`.
- Every task directory matches a row in `## Tasks`, and every row has a directory.
- Each `TASK.md` `id` equals its directory id, and `name` equals the directory name after the id.
- Every task directory lives under its phase directory (`<PHASE>/<task>/`).
- `depends-on` references stay in the same phase or an earlier phase, and every
  edge names a real data or ordering dependency.
- Every task declares `write-scope:` (or `none`), and no two unfinished tasks in
  a phase overlap without an edge; a serial phase states `serial-reason: <one
line>` in its `PHASE.md`.
- Each task gate names only task-local commands; every phase-shared or repo-wide
  check appears once, in the phase `GATES.md`, with its `scope:` and `lane:`.
- Every unfinished task declares a size: `tiny`, `small`, `medium`, or `large`.
  A complete task may declare `size: none` as a record opt-out.
- The spec is `status: in-progress`; no lock list is written.
- Every in-progress phase `MEMORY.md` carries a `## Execution Brief` naming
  Read, Write scope, Gate, Record, and Review, and every pending task carries
  the `## Execution` pointer to it; `mf-specs check` warns
  `phase.execution-brief-missing` when the brief is absent or incomplete.
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
  `waiver`, `rigor`, `gate run`, `gate record`, `mail`, and `lock` (confirmation
  only). Every verifier-checked record has one of these as its writer.
- **Write scope**: `TASK.md` frontmatter `write-scope:` — comma-separated
  repo-root-relative POSIX paths, optional trailing `/` for a subtree, `.` for
  the whole repo, or `none`; the task directory is implicit.
- **Gate layers**: task `GATES.md` for task-local commands; phase `GATES.md` for
  phase-shared and repo-wide checks, each named once with optional `scope:` and
  `lane: heavy|light`.
- **Channels**: `BOARD.md` broadcast (`mail --to all`) and `MAILBOX.md` targeted
  (`mail --to <task-id>`); the orchestrator is the sole writer and a worker reads
  both at start and before its receipt.
- **Scheduler**: `gate run` keys one attempt by command, scope, and file
  fingerprint; it runs one attempt per key, reuses an unchanged pass, reruns a
  failure, and bounds the heavy lane and in-flight count through
  `.agents/@montflow/gate.json`.
- **Rigor CLI**: `mf-specs rigor <trivial|light|standard|deep|critical>` prints exactly one installed rigor file from `.agents/@montflow/rigors/<rigor>.md`; there is no default, no listing, and no second rigor. The files are `packages/specs/rigors/*.md`, installed by `mf-specs doctor`.
- **Profiles CLI**: `mf-profiles list` (`/mf-profiles list` in the OpenCode host) pairs every profile name with its description — run it before choosing `reviewer-profiles`, never reading the store directory directly. `mf-profiles show <name>` (`/mf-profiles show <name>` in the host) reports that profile's instructions and review checklist when a description does not settle the choice.
- **Scaffold CLI**: `mf-specs init --name <spec> --rigor <rigor>` is the rigor-aware entry; `mf-specs create` (or `/specs create` in the OpenCode host) remains the rigor-agnostic scaffold — flags `--name`, `--description`, `--author`, `--workspace-type`, `--tasks` (each `name[:type[:gates[:size]]]`, size defaulting to `medium`), `--reviewer-profiles`.
- **Sizing config**: `<specs-root>/sizing.json` (repo layer) and `<spec>/sizing.json` (spec layer, with `phases.<PHASE>.sizes`); absent size entry means `inherit`.
- **Sizing CLI**: `mf-specs sizing --name <spec> --task <id> [--verbose|--human]` — compact by default (id, size, target, source); `--verbose` / `--human` add the task and phase budgets and the provenance matrix. `mf-specs resolve --name <spec> --task <id>` prints the bare dispatch target; `mf-specs status` / `next` show per-task size, target, and source.
- **Catalogue CLI**: `mf-specs models [--provider <id>] [--json] [--catalog <path>]` lists the models this harness can dispatch and their effort variants (`variants unknown` vs `variants none`); outside the host pass `--catalog <path>` to either form, or use the `spec_models` tool in the host. `mf-specs models --verify [--name <spec>]` cross-checks every config entry, warns `models.unknown-model` / `models.unknown-effort`, and states the entries checked and skipped split by layer and provider.
- **Prompt**: `packages/specs/prompts/spec-create.json` (`spec-create`), doctor-installed into `.agents/@montflow/prompts/`; it carries the authoring questions (rigor, isolation, origin, branch, worktree name) and renders the hidden branch away. Render it with `mf-specs author --request <text> --rigor <level> --isolated <yes|no>` or `/specs author` in the host.
- **Sizing prompt**: `packages/specs/prompts/spec-sizing.json` (`spec-sizing`), the wizard the `spec-sizing-orchestrator` role runs; render it with `mf-specs sizing-config` or `/specs sizing-config` / the `spec_sizing` tool. It generates one config layer from the live catalogue and writes nothing before confirmation.
- **Contract source**: `modules/rigor`, `modules/init`, `modules/scaffold`, `modules/lifecycle`, `modules/structure`, `modules/sizing`, `packages/specs/rigors/`, and the shipped `spec-create` prompt.
