# SpecStore service

Sole reader and writer of the spec directory tree. Turns a root + spec name
into the in-memory `SpecSnapshot` the `structure` module verifies, lists the
spec directories under a root, writes a fresh spec tree, and renames entries
for the migration verb.

## Belongs here

- `names`, `hasRoot`, `exists`, `snapshot`, `write`, `move` plus `StoreError`
- Directory entries in `snapshot` (`kind: 'directory'`, empty content) so the
  verifier can see an empty or stray directory
- `move` — parent creation, refuse an existing destination, rename
- POSIX path normalization for stable snapshot keys
- The file-backed `Default` layer

## Does not belong here

- Verification — `structure` / `spec` modules own the rules
- Rendering — the `scaffold` module renders files, the `cli` app renders output
- Migration planning — the `cli` app plans the moves
- Dispatching author sessions — the native `subagent` tool owns them

## Layers

Requires `FileSystem` + `Path` (`effect` core). Provide
`NodeFileSystem.layer` + `NodePath.layer` (or `NodeServices.layer`) at
the composition root.
