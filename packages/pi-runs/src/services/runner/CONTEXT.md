# Runner service

The run engine: one Pi session per run, our `Store` owns the durable
transcript. Workspace, CLI, and extension all call this layer.

## Belongs here

- `Runner` service (`start`, `resume`, `steer`, `answer`, `interrupt`, `detail`, `list`)
- `SessionPort` / `SessionFactory` — live-session abstraction so the engine is testable without Pi
- `WorkspaceBridge` — the two run→workspace calls (`toast`, `notify`)
- Replay seeding (`Replay.toMessages`) and `message_end` mirroring into `Store`
- Settlement: one receipt on `agent_settled`, then the per-run `onSettled` hook

## Rules

- Store is the only writer of `runs/<id>/`; the engine never touches files.
- Every Pi `message_end` mirrors into `Store` (user, assistant, toolResult); the dispatcher only creates, starts, and unparks the run.
- A run leaves the in-process registry when it settles or is interrupted.
- Resume refuses a run that fails `Replay.canReplay` (verify owns the full verdict).

## Does not belong here

- Pi session construction details — the Pi session factory
- CLI/TUI rendering — surfaces above this layer
- Profile-specific completion behavior — passed as `onSettled`

## Layers

`Default` requires `Store`, `SessionFactory`, `WorkspaceBridge`. Tests provide
`Store.Ephemeral` + a fake factory + `NoopWorkspaceBridge`.
