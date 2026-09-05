# Storage

Persist chat history as Markdown plus JSONL — skip SQLite for v1.

## Decision

Use raw files. Defer SQLite to a derived index, never the source of truth.

Why files win:

1. `git diff` shows history — SQLite blobs hide it.
2. Zero native deps — Pi loads `.ts` directly, same as `pi/zi`.
3. Human-editable — fix frontmatter with any editor.
4. Matches `pi-subagents` file artifacts — see [pi-subagents lessons](./pi-subagents-lessons.md).
5. Effect file IO already exists — no new driver to wrap.

SQLite returns when 1,000+ runs make `grep` slow. Then it is a cache rebuilt from `session.jsonl`.

## File rules

1. Append to `session.jsonl` live — one line per turn, `fsync` per write.
2. Regenerate `run.md` from `session.jsonl` after each append.
3. Write `receipt.md` once on settle — never mutate it after.
4. Commit `session.jsonl`, `run.md`, `receipt.md`; git-LFS for `session.jsonl` over 1 MB.

```text
.agents/@montflow/pi-runs/
  wiki/                  # this wiki, always committed
  runs/<id>/session.jsonl # the Pi session — committed, resumable
  runs/<id>/run.md        # rendered view — committed
  runs/<id>/receipt.md    # settlement — committed
```

## What not to store

- Secrets and tokens — redact before append, keep a `secrets.allowlist`.
- `node_modules` paths, absolute home paths — rewrite to repo-relative.

## See also

- [Architecture](./architecture.md) for directory root and session-owns-run flow.
- [Session model](./session-model.md) for `run.md` schema and replay order.
- [Pi-subagents lessons](./pi-subagents-lessons.md) for artifact patterns to copy.
- [Index](./index.md) for page map.
