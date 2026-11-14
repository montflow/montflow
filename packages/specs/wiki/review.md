Know how a phase gets reviewed, who judges it, and when it passes — in 2 minutes.

Review is how a [phase](./phases.md) is held to account before it can [lock](./lifecycle.md). A phase either **requires** review, **waives** it, or declares **none** — set in `PHASE.md` by `mf-specs waiver`, never hand-written. A review-required phase carries a [review task](./task.md#the-six-task-types) as its last task, and the verdict comes from a series under `.agents/@montflow/reviews/`.

## Review decisions: required, waived, none

| Decision   | Review task | What it means                                                                                 |
| ---------- | ----------- | --------------------------------------------------------------------------------------------- |
| `required` | yes, one    | a reviewer runs a round; the phase passes, reworks, or escalates                              |
| `waived`   | no          | the [waiver](./rigor.md#the-five-levels) policy permits skipping; evidence replaces the round |
| `none`     | no          | the phase holds no review at all and needs no waiver                                          |

A waived or `review: none` phase that holds a review task is an error (`phase.review-none-with-task`, `phase.waiver-with-review-task`). Whether a waiver is even allowed comes from the [rigor](./rigor.md) contract — `records-only` lets only a prose-only phase waive, and `critical` never waives.

## The verdict

After each reviewer round, `mf-specs review decide --name <spec> --phase <id>` reads the review store and the phase budget and returns one of seven verdicts:

- `start` — no round yet; the orchestrator should open one.
- `pass` — the latest round is clean; the phase is eligible to [lock](./lifecycle.md).
- `fix-and-stop` — minor findings; fix them but no new review round is needed.
- `rework` — findings remain and the [budget](#the-budget) allows another round.
- `overflow` — findings remain but the budget is spent; new work is out of scope.
- `escalate` — critical findings, an unparsable severity, or the escalation cap hit; a human decides.
- `waived` — the phase's waiver is effective; no round is required.

## Series and attribution

A [spec](./specs.md) named `<name>` owns a review series `<name>`; each [reviewer profile](./profiles.md) on a review task adds `<name>-<profile>`. A phase's review lands on one round attributed to that phase in the round's `## Metadata`. A complete review task needs a round in every expected series at one agreed round; a round with no parsable phase is a warning (`review.phase-unattributed`).

## The budget

The number of review rounds a phase may hold is not a guess — it is derived from the [task sizes](./task.md#sizes-and-budgets). Each size buys cycles (tiny 1, small 2, medium 3, large 3), the phase budget is the largest contribution among its non-review tasks capped at 3, and a series holding more rounds than the budget fails `review.budget-exceeded`.

## Severities

A reviewer finding carries a severity: `Critical`, `Major`, `Minor`, or `Nit`. Open findings by severity drive the verdict — any open critical or major pushes toward `rework` or `escalate`, a minor-only round is `fix-and-stop`, and a clean round is `pass`. An unparsable severity is `review.severity-unparsable`.

## The reviewer

A review task names its [reviewer profiles](./profiles.md) in `reviewer-profiles`; each profile is a shipped [profile](./profiles.md) that the round attributes to its own series. The [reviewer](./actors.md) records a verdict with `gate record --judge`, and `review decide` reads those records. A phase locks only after a passing round, an effective [waiver](./rigor.md#the-five-levels), or a `review: none` declaration — see [lifecycle](./lifecycle.md).
