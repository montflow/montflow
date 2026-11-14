Read a task record and know its type, scope, size, and gates — in 1 minute.

A task is the smallest unit of work in a [spec](./specs.md). It lives inside a [phase](./phases.md) as `<phase>/<A001>-<kebab-name>/`, holding `TASK.md` (and optional `GATES.md`). Every task is one of six types, declares who originated it, bounds its own write scope, and — when gated — proves itself before it can close.

## The task record

`TASK.md` frontmatter: `id`, `name`, `type`, `originator`, `size`, `depends-on`, `write-scope`, `related-tasks`, `reviewer-profiles` (review only), `finding-ref`, `status`. Body sections `## Type:`, `## Description`, `## Requirements`, `## Completion`.

| Field         | Meaning                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| `id`          | `A001` — matches the directory, set by [new-task](./authoring.md#grow-a-phase-or-task), never guessed |
| `type`        | one of `exploratory \| execution \| planning \| interruptor \| defect \| review`                      |
| `originator`  | `user`, `defect:<task-id>`, or `planner:<task-id>` — who raised the work                              |
| `size`        | `tiny \| small \| medium \| large`; `none` only on a complete task                                    |
| `write-scope` | the repo paths this task may touch; `.` or a comma list                                               |
| `status`      | `pending \| in-progress \| complete \| blocked`, derived by [claim](./verbs.md#claim-authority)       |

## The six task types

- **exploratory** — research and sizing; required first in [rigor](./rigor.md) levels that mandate exploration.
- **execution** — the doing; gates every task, and its `write-scope:` must be a real path (no `.` default).
- **planning** — decides; not gated as code work.
- **interruptor** — cross-cutting check that can block others.
- **defect** — a bug found in review, `originator: defect:<task-id>`, gates like execution.
- **review** — the [review](./review.md) round for its phase; holds `reviewer-profiles`, one per phase, no `write-scope`.

## Sizes and budgets

Each task declares a `size`. The size buys a [dispatch target](./sizing.md) and a [review budget](./review.md#the-budget) — tiny 1, small 2, medium 3, large 3 rounds, capped at 3. A pending task with `size: none` fails `task.size-none-unfinished`; the sizes themselves come from the optional `sizing.json` config, so a task can be [sized](./sizing.md) at authoring time or later.

## Gates

A gated task (execution, defect, interruptor) carries `GATES.md` with a mechanical stage that runs `mf-specs gate run` and records to `GATE-RESULTS.jsonl`. A [phase gate](./phases.md#gates) holds the phase-level checks; a task gate never duplicates it (`gate.shared-check-in-task`). A close without proof fails `gate.unproven` — no task completes on trust.

## Write scope

`write-scope:` is the single-file boundary of a task. The [worker](./actors.md) that claims the task may touch only those paths; execution/defect/interruptor tasks must name a real scope or `check` reports `task.write-scope-missing`. Two tasks writing the same path is a `phase.write-scope-overlap` finding.

## How tasks fit

A [phase](./phases.md) is a group of tasks plus its own record; a [spec](./specs.md) is the phases. The [orchestrator](./actors.md) dispatches workers to tasks, each worker claims one task, executes within its write scope, proves its gates, and closes. A phase locks when every task under it is complete and gated — see [lifecycle](./lifecycle.md).
