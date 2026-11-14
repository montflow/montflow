Size a task and know what target it dispatches to and what it is allowed to spend — in 1 minute.

Sizing is how a [task](./task.md) declares its effort and buys a dispatch target and a [review budget](./review.md#the-budget). Each task carries a `size`; the optional `sizing.json` config maps those sizes to concrete dispatch targets. There is no guessing: a size resolves to one `provider/model`, an optional effort variant, and a verification mode.

## The sizes

`tiny`, `small`, `medium`, `large`. `medium` is the default. `none` is a record-only opt-out valid **only on a complete task** — a pending task with `size: none` fails `task.size-none-unfinished`.

Each size buys review cycles: tiny 1, small 2, medium 3, large 3, capped at 3. A phase's [review budget](./review.md#the-budget) is the largest contribution among its non-review tasks.

## The config

`config` lives in `sizing.json` at the [spec root](./specs.md#store-layout) or the repo root. Three layers, most-specific wins:

```text
sizing.json                 # repo-wide
<name>/sizing.json          # spec-wide + per-phase overrides
```

Each size entry maps to a dispatch target: `model` is `provider/model`, optional `effort` is a catalogue variant token, optional `verification` is `light` or `full` (default `light`). A target renders as `provider/model#effort`.

| Field          | Meaning                                             |
| -------------- | --------------------------------------------------- |
| `model`        | `provider/model` to dispatch the task to            |
| `effort`       | a catalogue variant token (optional)                |
| `verification` | `light` or `full` — how strictly the task is proven |

A task with no config anywhere resolves `inherit` — the [authoring](./authoring.md) generator leaves the target to a later [sizing-config](./verbs.md#generators) pass. `mf-specs resolve --name <spec> --task <id>` prints the resolved target and provenance.

## Verification modes

Each size entry declares a verification mode: `light` keeps task-local mechanical gates and skips repo-wide gates and final review; `full` keeps the current strict behavior. The resolver, [status](./verbs.md#readers), [lock derivation](./phases.md#the-lock-is-derived), [review decide](./review.md#the-verdict), and the execution loop all read the same mode, so a `light` task is proven exactly as strictly as its entry says.

## Size at authoring time or later

[new-task](./authoring.md#grow-a-phase-or-task) accepts `--size`; a task can also be sized later with the `sizing-config` prompt or by adding the `sizing.json` entry. The [verifier](./authoring.md#how-it-is-mechanically-verified) reports `task.missing-size`, `task.unknown-size`, and `task.size-none-unfinished` — a sized tree always resolves.

## Where sizing is owned

The `sizing.json` files are verified by [check](./authoring.md#how-it-is-mechanically-verified) (`sizing.malformed-config`, `sizing.unknown-size`, `sizing.missing-model`, `sizing.unknown-phase`) and read by `mf-specs sizing`, `resolve`, and the execution dispatch. The [sizing-orchestrator](./profiles.md#the-six-shipped-spec-profiles) profile sizes tasks; see [profiles](./profiles.md) and [actors](./actors.md) for who runs it.
