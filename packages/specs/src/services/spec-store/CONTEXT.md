# SpecStore service

Sole reader and writer of the spec directory tree. Turns a root + spec name
into the in-memory `SpecSnapshot` the `structure` module verifies, lists the
spec directories under a root, and writes a fresh spec tree.

## Belongs here

- `names`, `hasRoot`, `exists`, `hasFile`, `snapshot`, `readRootFile`, `write`
  plus `StoreError` (carries the failing `path` and the original platform
  `cause`, so the CLI can render a coded `store.error` diagnostic)
- `hasFile` is the targeted presence check (`root/<name>/<relative>`), used when
  a caller needs one known file — such as `SPEC.md` during branch detection —
  without reading every file of every spec
- POSIX path normalization for stable snapshot keys
- The file-backed `Default` layer

## Does not belong here

- Verification — `structure` / `spec` modules own the rules
- Rendering — the `scaffold` module renders files, the `cli` app renders output
- Dispatching author sessions — the native `subagent` tool owns them

## Layers

Requires `FileSystem` + `Path` (`effect` core). Provide
`NodeFileSystem.layer` + `NodePath.layer` (or `NodeServices.layer`) at
the composition root.
