# Storage

Persist runs as plain files — not SQLite, and **not** Pi's native session
format.

## Decision

Raw files are the source of truth. SQLite is deferred to a derived index.

Why files win:

1. Human-editable — fix frontmatter with any editor.
2. Zero native deps — Pi loads the `.ts` sources directly, same as `pi/zi`.
3. Effect file IO already exists — no new driver to wrap.
4. Matches the `pi-subagents` file-artifact style.

SQLite returns when 1,000+ runs make `grep` slow. Then it is a cache rebuilt
from `session.jsonl`.

## Layout

```text
.agents/@montflow/runs/<run-id>/
  run.md          # frontmatter (JSON descriptor) + rendered body
  session.jsonl   # one event per line
  receipt.md      # terminal runs only
```

## File rules

1. Append one line to `session.jsonl` per mirrored Pi `message_end`.
2. Regenerate `run.md` from the full event list after each write — it is a
   derived view, never hand-edit it.
3. Write `receipt.md` exactly once on settle; never mutate it.
4. All writes are **atomic**: write `<file>.tmp`, then rename over the target,
   so a concurrent reader sees the old or the new file, never a truncated mix.
5. Guard every run write with an empty `.lock/` directory. A lock older than
   60s is treated as a crashed writer and reclaimed once.
6. The whole store is git-ignored. `Runner.verifyStore` reads the repo
   `.gitignore` and reports when the runs path is not ignored.

## Formats

`run.md` frontmatter — JSON `Run` descriptor:

```json
{
  "id": "fix-login",
  "parent": null,
  "status": "running",
  "created": "...",
  "updated": "...",
  "sessionFile": ".agents/@montflow/runs/fix-login/session.jsonl",
  "name": "...",
  "prompt": "...",
  "model": "...",
  "thinking": "high",
  "tools": ["read", "write", "edit"]
}
```

`session.jsonl` — one event per line (shown expanded):

```json
{
  "seq": 1,
  "role": "user",
  "text": "Fix login.",
  "at": "2026-09-05T00:00:01Z",
  "message": { "role": "user", "content": "Fix login.", "timestamp": 0 }
}
```

- Roles: `user`, `assistant`, `system`, `toolResult`.
- `text` is the display projection; `message` is the raw Pi `AgentMessage` and
  the replay source of truth.
- `system` events without a `message` (questions, subrun pointers) are skipped
  on replay.

`receipt.md` frontmatter — `{runId, outcome, summary, endedAt}`, where
`outcome` is `done`, `failed`, or `cancelled`.

## Not Pi's native format

Pi's own sessions live at
`~/.pi/agent/sessions/--<cwd>--/<timestamp>_<session-id>.jsonl` and are
versioned **tree** files: a `session` header, entries linked by
`id`/`parentId`, and entry types (`message`, `compaction`, `model_change`,
`usage`, `custom`, `branch_summary`, ...).

pi-runs stores a **linear** `seq` log instead, copying each raw `AgentMessage`
verbatim:

- Kept: replayable `user` / `assistant` / `toolResult` messages.
- Not kept: the branch tree, compaction checkpoints, usage entries, prompt
  sections, and model-change entries.
- Resume rebuilds a fresh in-memory manager and `appendMessage`s the raw
  messages in `seq` order.

Consequence: a run that Pi auto-compacted replays un-compacted on resume.

## What not to store

- Secrets and tokens — redact before append.
- `node_modules` paths, absolute home paths — rewrite to repo-relative.

## See also

- [Architecture](./architecture.md) for the store root and session-owns-run flow.
- [Session model](./session-model.md) for `run.md` schema and replay order.
- [Process and recovery](./process-and-recovery.md) for crash safety.
- [Index](./index.md) for the page map.
