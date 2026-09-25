# FeatureStore service

Sole reader of the feature directory tree. Turns a root + feature name
into the in-memory `FeatureSnapshot` the `structure` module verifies,
and lists the feature directories under a root.

## Belongs here

- `names`, `hasRoot`, `snapshot` plus `StoreError`
- POSIX path normalization for stable snapshot keys
- The file-backed `Default` layer

## Does not belong here

- Verification — `structure` / `feature` modules own the rules
- Rendering — the `cli` app owns output
- Writing feature files — a future authoring service

## Layers

Requires `FileSystem` + `Path` (`effect` core). Provide
`NodeFileSystem.layer` + `NodePath.layer` (or `NodeServices.layer`) at
the composition root.
