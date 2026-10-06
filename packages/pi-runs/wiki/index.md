# pi-runs wiki

Start a repo-local run in 2 minutes — pick the page you need.

1. Read [architecture](./architecture.md) to pick the store location and layout.
2. Read [session model](./session-model.md) to create runs and subruns.
3. Read [storage](./storage.md) to understand the file formats and Pi delta.
4. Read [process and recovery](./process-and-recovery.md) for instance and crash
   behavior.
5. Read [pi-subagents lessons](./pi-subagents-lessons.md) for reused patterns.

## Pages

- [Architecture](./architecture.md) — where runs live and how Pi flow changes.
- [Session model](./session-model.md) — run directory, statuses, chat history.
- [Storage](./storage.md) — raw files over SQLite, event format, Pi delta.
- [Process and recovery](./process-and-recovery.md) — one process per session,
  crash vs clean shutdown, resume rules.
- [Pi-subagents lessons](./pi-subagents-lessons.md) — patterns reused from the
  reference extension.

## See also

- [Session model](./session-model.md) for run vs subrun rules.
- [Storage](./storage.md) for the SQLite rejection.
