Know the spec roles — the reviewer profiles and the originator actor — in 1 minute.

Profiles are the named roles a spec run plays. Two kinds matter: **reviewer profiles**, named on a [review task](./task.md#the-six-task-types), and the **originator**, who raised a task. The profiles package (`@montflow/profiles`) ships six spec profiles; `mf-profiles doctor` installs them into `.agents/@montflow/profiles/`.

## The six shipped spec profiles

| Profile                       | Role                                                  |
| ----------------------------- | ----------------------------------------------------- |
| `spec-appraiser`              | sizes and verdicts a request before authoring         |
| `spec-creation-orchestrator`  | drives [authoring](./authoring.md) end to end         |
| `spec-execution-orchestrator` | drives execution of a [phase](./phases.md)            |
| `spec-worker`                 | executes one [task](./task.md) within its write scope |
| `spec-sizing-orchestrator`    | [sizes](./sizing.md) tasks and dispatch targets       |
| `spec-bookkeeper`             | maintains the records and the store                   |

These map onto the [actors](./actors.md): the appraiser and creation-orchestrator are the author's side; the execution-orchestrator and worker are the execution cast; the bookkeeper keeps the tree honest.

## Reviewer profiles on a review task

A [review](./review.md) task names its reviewers with `reviewer-profiles: <slug,slug>` — set by [new-task](./authoring.md#grow-a-phase-or-task) or the [authoring](./authoring.md) generator, and only valid on a `review` task (`task.reviewer-profiles-forbidden` otherwise). Each declared profile contributes its own [review series](./review.md#series-and-attribution) `<name>-<profile>`, so a phase reviewed by two profiles runs two series that must both land a round before it can [lock](./lifecycle.md).

An unknown profile slug is a `reviewer-profile.unknown` finding — the [verifier](./authoring.md#how-it-is-mechanically-verified) checks names against the installed set.

## The originator

Every [task](./task.md) declares an `originator` — who raised the work. It is one of:

- `user` — a human requested it (the default).
- `defect:<task-id>` — a bug found in [review](./review.md), pointing back to the finding.
- `planner:<task-id>` — a planning task decided the work.

The originator links a task to its source: a `defect` task carries the review round and `finding-ref` that raised it.

## How profiles are installed

The six profiles are package payload, declared in `@montflow/profiles` `payload.json`. `mf-profiles doctor` installs or refreshes them into `.agents/@montflow/profiles/`; a local edit is `stale` and repair overwrites it — the same [payload](./payload.md) contract every package shares.

## Where they connect

The profiles are the concrete cast of the [actor model](./actors.md) — one profile per role, installed by [payload](./payload.md), named on review tasks, and checked by the [verifier](./authoring.md#how-it-is-mechanically-verified). A spec run is a set of profiles working the tree under the orchestrator's authority.
