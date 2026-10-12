# Store service

Sole writer of the session's metadata files: `session.md`, the display transcript
`session.jsonl`, and `receipt.md`. Pi owns `pi-session.jsonl` through the
session factory (see the session runner context).

## Belongs here

- `NATIVE_SESSION_FILE` — the file name Pi writes the session's native session to inside the session directory
- `create`, `start`, `append`, `settle`, `load`, `list`, `verify` plus `StoreError`
- Display captures (`name`, `prompt`, `model`, `tools`, `related`, `spec`) persist through every rewrite via `withExtras`
- `verify` reads raw files and delegates to the pure verify module (validity + resumability)
- `append`/`answer` carry the raw Pi `message` for lossless replay; `text` stays the display projection
- `Backend` interface with file and memory implementations
- Frontmatter helpers, per-session `.lock` guard (file backend), load invariant

## Persistence is a layer choice

- `Default` / `makeWithRoot` — file backend under `sessions/`, git-ignored
- `Ephemeral` — memory backend, same rules, no disk, not resumable
- Pick per session at the provide site; `sessionFile` is advisory for ephemeral

## Does not belong here

- Pi execution, prompt content, RPC — callers above this layer
- Schema shapes — those live in `session/`, `session-event/`, `receipt/`

## Layers

Requires `FileSystem` + `Path` services (`effect` core). Provide
`NodeFileSystem.layer` + `NodePath.layer` from `@effect/platform-node`.
Timestamps use wall-clock ISO strings; deterministic time comes later.
