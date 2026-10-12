# Session module

Schema-class data model for pi-sessions. One `Session` instance equals one Pi session file.

Singular name per the TypeScript modules skill (`session` → `Session`).

Note: namespace + class share the name, so call-site reads `Session.Session`.
This stutter is the cost of matching the skill's folder convention and the
Effect `Schema.Class` identifier. Prefer `Sessions.Session` (plural folder) if the
stutter becomes painful — that rename is one `mv` plus index edits.

## Belongs here

- `Id`, `Status`, `Session` class plus boundary helpers
- `decodeUnknown`, `encode` for frontmatter and `session.jsonl` headers
- Session identity helpers every dispatching host shares: `isValidId`,
  `slugifyName`, `newId` (Clock-driven, no wall-clock reads)

## Does not belong here

- Lifecycle transitions (`start`, `settle`) — those live in `pi-sessions`
- File IO and session resuming — future `store` module
