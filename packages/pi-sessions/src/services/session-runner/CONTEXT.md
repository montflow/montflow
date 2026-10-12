# SessionRunner service

The session engine: one Pi session per session. Pi owns the session's native session file
(`sessions/<id>/pi-session.jsonl`) via `SessionManager.open`; `Store` owns lifecycle
metadata and the display transcript (`sessions/<id>/session.jsonl`). Workspace, CLI,
and extension all call this layer.

## Belongs here

- `SessionRunner` service (`start`, `resume`, `steer`, `answer`, `interrupt`, `detail`, `verify`, `verifyStore`, `progress`, `list`, `liveSessionIds`)
- `spec` binding: `start` persists the spec slug a session works on; `liveSessionIds` reports sessions with a live session (stale persisted `running` statuses excluded)
- `model` / `thinking` pins: `start` persists both on the session and applies them
  to the Pi session; `resume` reuses the persisted pins so replay stays faithful
- `SessionPort` / `SessionFactory` — live-session abstraction so the engine is testable without Pi
- `WorkspaceBridge` — the two session→workspace calls (`toast`, `notify`)
- Native session: `start`/`resume` pass an absolute `sessionFile` so Pi opens and appends the session's native session (compaction and branches survive resume)
- Replay seeding (`Replay.toMessages`) and `message_end` mirroring into `Store` — the in-memory fallback plus the display transcript
- Settlement: one receipt on `agent_settled`, then the per-session `onSettled` hook

## Rules

- `Store` is the only writer of the metadata files; Pi writes `pi-session.jsonl`
  through the session factory (`SessionManager.open`).
- Every Pi `message_end` mirrors into `Store` (user, assistant, toolResult); the dispatcher only creates, starts, and unparks the session.
- A session leaves the in-process registry when it settles or is interrupted.
- Resume refuses a session that fails `Replay.canReplay` (verify owns the full verdict).
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
