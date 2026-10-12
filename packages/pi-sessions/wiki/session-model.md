# Session model

Create repo-local sessions where the data file is our own transcript, not Pi's.

## Session directory

Flat — one directory per session. A subsession is the same shape with `parent` set; it
is not nested under its parent.

```text
sessions/
  fix-login/
    session.md
    session.jsonl
    receipt.md
  scout-auth/          # a subsession: parent: "fix-login"
    session.md
    session.jsonl
```

## Lifecycle

Statuses: `pending`, `running`, `awaiting-input`, `done`, `failed`,
`cancelled`.

```mermaid
stateDiagram-v2
  [*] --> pending: Store.create
  pending --> running: Store.start
  running --> awaiting-input: Store.ask (ask_user)
  awaiting-input --> running: Store.unpark
  running --> done: Store.settle
  running --> failed: Store.settle
  running --> cancelled: Store.cancel (interrupt)
  awaiting-input --> cancelled: Store.cancel
```

- `done` / `failed` / `cancelled` are terminal and **require** a receipt.
- `pending` / `running` / `awaiting-input` must **not** have one.
- `Store.load` rejects any status/receipt mismatch, so drift is never silent.

## Store verbs

| Verb       | From → To                              | Notes                                                   |
| ---------- | -------------------------------------- | ------------------------------------------------------- |
| `create`   | ∅ → pending                            | writes `session.md` + an empty `session.jsonl`          |
| `start`    | pending → running                      |                                                         |
| `append`   | running / awaiting-input               | one mirrored Pi message; `seq` = events + 1             |
| `ask`      | running → awaiting-input               | writes a `system` event carrying the question           |
| `unpark`   | awaiting-input → running               | no event; the answer rides the `ask_user` result        |
| `answer`   | awaiting-input → running               | records a user turn (store-level; engine uses `unpark`) |
| `settle`   | running / awaiting-input → done/failed | writes the receipt                                      |
| `cancel`   | running / awaiting-input → cancelled   | writes the receipt                                      |
| `progress` | same status                            | updates the `progress` frontmatter only                 |

## session.md format

`session.md` is a frontmatter block followed by a rendered body. The frontmatter is
a single-line JSON `Session` descriptor between `---` fences; the body is derived
from the events (shown expanded):

```text
---
{"id":"fix-login","parent":null,"status":"running","created":"...","updated":"...","sessionFile":".agents/@montflow/sessions/fix-login/session.jsonl"}
---

# session fix-login

## turn 1 — user

Fix login.

## turn 2 — assistant

Scouting auth code.
```

Frontmatter keys:

1. `id` — stable id, matches the directory name.
2. `parent` — `null` for main sessions, `<session-id>` for subsessions.
3. `status` — one of the lifecycle statuses.
4. `created` / `updated` — ISO timestamps; `created` never changes.
5. `sessionFile` — advisory path to `session.jsonl` (Pi's in-memory manager
   does not write it).
6. Optional captures: `name`, `prompt`, `model`, `tools`, `related`, `spec`,
   `progress`. All survive every status rewrite.

## session.jsonl

One JSON object per line, appended as Pi emits each message. This file is the
session — it is what resume replays.

```json
{
  "seq": 1,
  "role": "user",
  "text": "Fix login.",
  "at": "...",
  "message": { "role": "user", "content": "Fix login.", "timestamp": 0 }
}
```

- `session.md` renders from `session.jsonl` — never edit `session.md` by hand.
- Resume reopens `session.jsonl` in `seq` order.
- Event shape and the API-persistence delta: [storage](./storage.md).

## Subsessions

1. Create a normal session with `parent: <parent-session-id>`; it lands as a sibling
   directory, not inside the parent.
2. The engine appends the subsession's own transcript to its own directory.
3. On settle, the session runner notifies the parent via `followUp` if the parent is
   live in the same process.

## See also

- [Architecture](./architecture.md) for the store location and session flow.
- [Storage](./storage.md) for file formats and the Pi-format delta.
- [Process and recovery](./process-and-recovery.md) for resume and crash paths.
- [Index](./index.md) for the page map.
