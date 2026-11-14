Pick a [rigor level](#the-five-levels) and know exactly what it buys and what it blocks — in 1 minute.

Rigor is the mechanical contract a [spec](./specs.md) is written to. It is not prose: five named levels, each a table of hard limits the [authoring](./authoring.md) verbs and the [check](./authoring.md#how-it-is-mechanically-verified) reader both enforce. There is no default — a [spec](./specs.md) without a rigor value is an error.

## The five levels

| Level      | phases | tasks | tasks/phase | exploration | review   | gate             | waiver       |
| ---------- | ------ | ----- | ----------- | ----------- | -------- | ---------------- | ------------ |
| `trivial`  | 1      | ≤ 2   | ≤ 2         | forbidden   | waived   | command-per-task | permitted    |
| `light`    | 1      | ≤ 4   | ≤ 4         | optional    | waived   | per-task         | permitted    |
| `standard` | 1–2    | ≤ 6   | ≤ 4         | optional    | required | per-task         | records-only |
| `deep`     | 2–3    | ≤ 9   | ≤ 5         | required    | required | phase-and-task   | records-only |
| `critical` | 2–4    | ≤ 12  | ≤ 6         | required    | required | phase-and-task   | forbidden    |

Each column is a real constraint, not guidance:

- **phases / tasks** — how many [phases](./phases.md) and [tasks](./task.md) the level allows; a grown tree past a ceiling fails `rigor.ceiling-exceeded`.
- **exploration** — whether an `exploratory` task is `forbidden`, `optional`, or `required` (required rigors open phase `A` with one).
- **review** — `waived` means no [review](./review.md) round is forced; `required` auto-generates a `review-phase` task last in the phase.
- **gate** — `command-per-task` gates every task; `per-task` gates each task; `phase-and-task` adds a [phase gate](./phases.md#gates).
- **waiver** — whether a phase may waive its review: `permitted`, `records-only` (only a prose-only phase can waive), or `forbidden`.

## Where rigor lives

The rigor is stored in the [spec's](./specs.md) `## Creation` body section, never frontmatter, parsed as `- rigor: <level>` and `- rigor: <new> (raised-from <old>)`. The `mf-specs rigor <level>` verb prints the record; the authoring generators and the verifier read the same `RIGOR_CONTRACT` table.

## Who enforces it

- [init](./authoring.md#two-ways-in) validates the whole plan against the contract **before writing a file** — a violation is refused with an `init.*` code.
- [new-phase](./authoring.md#grow-a-phase-or-task) and [new-task](./authoring.md#grow-a-phase-or-task) re-apply the ceilings, so you cannot grow past the level.
- [waiver](./verbs.md#generators) refuses a waiver the policy forbids; `critical` never waives.
- [check](./authoring.md#how-it-is-mechanically-verified) re-verifies the live tree, so an edit past the contract is `rigor.ceiling-exceeded`.

## Choosing

Pick by consequence. `trivial` and `light` skip [review](./review.md); `standard` is the middle; `deep` and `critical` force exploration, require review, and (for `critical`) forbid waiver entirely. Raise the level explicitly with `- rigor: <new> (raised-from <old>)` — never silently.

## Where rigor is set

The shipped rigors are payload — install or refresh them with `mf-specs doctor`. See [payload](./payload.md).
