# Store service

Sole file owner for `runs/`. Only code allowed to write `run.md`,
`session.jsonl`, `receipt.md`.

## Belongs here

- `create`, `start`, `append`, `settle`, `load`, `list` plus `StoreError`
- `Backend` interface with file and memory implementations
- Frontmatter helpers, per-run `.lock` guard (file backend), load invariant

## Persistence is a layer choice

- `Default` / `makeWithRoot` — file backend under `runs/`, git-tracked
- `Ephemeral` — memory backend, same rules, no disk, not resumable
- Pick per run at the provide site; `sessionFile` is advisory for ephemeral

## Does not belong here

- Pi execution, prompt content, RPC — callers above this layer
- Schema shapes — those live in `run/`, `run-event/`, `receipt/`

## Layers

Requires `FileSystem` + `Path` services (`effect` core). Provide
`NodeFileSystem.layer` + `NodePath.layer` from `@effect/platform-node`.
Timestamps use wall-clock ISO strings; deterministic time comes later.
