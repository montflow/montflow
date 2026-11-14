See what a phase owns, when it locks, and what has to be true first — in 1 minute.

A phase is a directory named `A`, `B`, … under the [spec](./specs.md). It holds its own objective, memory, gate, broadcast board, and tasks. Its status is derived from those tasks; you never type it.

## Files in a phase

```text
<spec>/<PHASE>/
  PHASE.md               # objective, status, review, review-reason, gate
  MEMORY.md              # phase memory
  BOARD.md               # phase broadcast channel
  GATES.md               # optional phase gate
  GATE-RESULTS.jsonl     # optional recorded gate results
  <PHASE><NNN>-<name>/   # one directory per task
    TASK.md
    MEMORY.md
    GATES.md             # optional task gate
    MAILBOX.md           # optional targeted channel
    GATE-RESULTS.jsonl   # optional recorded results
```

`PHASE.md` and `MEMORY.md` are required at v2. The rest are optional and appear when the phase needs them. Numbering restarts per phase: `A001`, `A002`, then `B001`. A phase holds one [task](./task.md) directory per task.

## `PHASE.md`

| Field             | Meaning                                   |
| ----------------- | ----------------------------------------- |
| `id`              | equals the directory name                 |
| `objective`       | one line saying what the phase achieves   |
| `status`          | derived from the phase's tasks            |
| `review`          | `required`, `waived`, or `none`           |
| `review-reason`   | required only when waived                 |
| `review-evidence` | the gate evidence standing in for a round |
| `gate`            | `none`, `mechanical`, or `subjective`     |

The file is written by `init`, `new-phase`, and `waiver` — see [authoring](./authoring.md). Do not hand-write a status or a review decision.

## Review: required, waived, or none

A phase reviews, waives, or holds no review at all — the full [review](./review.md) rules apply. A `required` phase holds exactly one generated [review task](./task.md#the-six-task-types); a `waived` phase holds none and records the reason plus the evidence that replaces the round; a `review: none` phase holds no review task and needs no waiver. A waived or `review: none` phase that holds a review task is an error. Whether a waiver is allowed comes from the [rigor](./rigor.md) contract.

The review decision is not re-derived from prose. After every reviewer round, `mf-specs review decide` reads the review store and the phase budget and returns `start`, `pass`, `fix-and-stop`, `rework`, `overflow`, `escalate`, or `waived`. The orchestrator obeys that verb instead of counting rounds. A `review: none` phase has no cycle to decide and reports budget 0.

## Gates

A gate stage declares `kind: mechanical` or `kind: subjective`:

1. A mechanical stage names a `command:`; `mf-specs gate run` executes it and appends the command, exit status, timestamp, and output to `GATE-RESULTS.jsonl`.
2. A subjective stage names a `judge:`; only that reviewer records a verdict with `mf-specs gate record`.
3. A complete task or phase with no recorded passing result fails `check` with `gate.unproven`.

Task gates prove the task's own scope. Phase or repo-wide checks are named once at the phase gate and never copied into every task.

## The lock is derived

A phase is **complete** when every task under it is complete. It is **locked** when it is also:

1. gate-proven — every classified mechanical stage has a passing result, and
2. reviewed — a review round for that phase is closed, the waiver is effective,
   or the phase declares `review: none`.

`mf-specs lock --name <spec> --phase <id>` recomputes that conjunction. It prints `locked <phase>` at exit 0, or one blocker code per line at exit 1, and writes nothing. There is no lock file and no stored lock list; no surface reads one. The lock is the gate the [orchestrator](./actors.md) clears before moving on in the [lifecycle](./lifecycle.md).

## Create and grow

```bash
mf-specs init --name ship-login --rigor standard
mf-specs new-phase --name ship-login --objective "Ship the second slice"
mf-specs new-task --name ship-login --phase B --task ship --type execution
```

`init` allocates phase and task ids from the plan. `new-phase` and `new-task` allocate the next id from disk — see [authoring](./authoring.md) for the growth verbs. A phase whose review should be waived is set with `mf-specs waiver`, never by editing the file. The [verifier](./authoring.md#how-it-is-mechanically-verified) proves a phase against its [gates](#gates) and its [rigor](./rigor.md) ceiling. The verbs that change a phase are listed in [verbs](./verbs.md); the payloads it ships install with [payload](./payload.md).
