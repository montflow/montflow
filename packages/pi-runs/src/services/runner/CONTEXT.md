# Runner service

The run engine: one Pi session per run. Pi owns the run's native session file
(`runs/<id>/pi-session.jsonl`) via `SessionManager.open`; `Store` owns lifecycle
metadata and the display transcript (`runs/<id>/session.jsonl`). Workspace, CLI,
and extension all call this layer.

## Belongs here

- `Runner` service (`start`, `resume`, `steer`, `answer`, `interrupt`, `detail`, `verify`, `verifyStore`, `progress`, `list`, `liveRunIds`)
- `spec` binding: `start` persists the spec slug a run works on; `liveRunIds` reports runs with a live session (stale persisted `running` statuses excluded)
- `model` / `thinking` pins: `start` persists both on the run and applies them
  to the Pi session; `resume` reuses the persisted pins so replay stays faithful
- `SessionPort` / `SessionFactory` — live-session abstraction so the engine is testable without Pi
- `WorkspaceBridge` — the two run→workspace calls (`toast`, `notify`)
- Native session: `start`/`resume` pass an absolute `sessionFile` so Pi opens and appends the run's native session (compaction and branches survive resume)
- Replay seeding (`Replay.toMessages`) and `message_end` mirroring into `Store` — the in-memory fallback plus the display transcript
- Settlement: one receipt on `agent_settled`, then the per-run `onSettled` hook

## Rules

- `Store` is the only writer of the metadata files; Pi writes `pi-session.jsonl`
  through the session factory (`SessionManager.open`).
- Every Pi `message_end` mirrors into `Store` (user, assistant, toolResult); the dispatcher only creates, starts, and unparks the run.
- A run leaves the in-process registry when it settles or is interrupted.
- Resume refuses a run that fails `Replay.canReplay` (verify owns the full verdict).
- `verifyStore` reads the repo `.gitignore` and delegates the decision to
  `Verify.verifyStoreIgnored`; the engine decides nothing about ignore syntax.

## Does not belong here

- Pi session construction details — the Pi session factory
- CLI/TUI rendering — surfaces above this layer
- Profile-specific completion behavior — passed as `onSettled`

## Layers

`Default` requires `Store`, `SessionFactory`, `WorkspaceBridge`, `FileSystem`,
`Path`. Tests provide `Store.Ephemeral` + a fake factory + `NoopWorkspaceBridge`

- node filesystem/path.
