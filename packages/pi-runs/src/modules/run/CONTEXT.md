# Run module

Schema-class data model for pi-runs. One `Run` instance equals one Pi session file.

Singular name per the TypeScript modules skill (`run` → `Run`).

Note: namespace + class share the name, so call-site reads `Run.Run`.
This stutter is the cost of matching the skill's folder convention and the
Effect `Schema.Class` identifier. Prefer `Runs.Run` (plural folder) if the
stutter becomes painful — that rename is one `mv` plus index edits.

## Belongs here

- `Id`, `Status`, `Run` class plus boundary helpers
- `decodeUnknown`, `encode` for frontmatter and `session.jsonl` headers

## Does not belong here

- Lifecycle transitions (`start`, `settle`) — those live in `pi-runs`
- File IO and session resuming — future `store` module
