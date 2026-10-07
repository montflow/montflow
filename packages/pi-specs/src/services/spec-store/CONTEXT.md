# SpecStore service

Sole reader of the spec directory tree. Turns a root + spec name
into the in-memory `SpecSnapshot` the `structure` module verifies,
and lists the spec directories under a root.

## Belongs here

- `names`, `hasRoot`, `snapshot` plus `StoreError`
- POSIX path normalization for stable snapshot keys
- The file-backed `Default` layer

## Does not belong here

- Verification — `structure` / `spec` modules own the rules
- Rendering — the `cli` app owns output
- Writing spec files — a future authoring service

## Layers

Requires `FileSystem` + `Path` (`effect` core). Provide
`NodeFileSystem.layer` + `NodePath.layer` (or `NodeServices.layer`) at
the composition root.
