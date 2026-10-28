# Store

Reads the `mf-skills sync` manifest that records what an installed workspace
received: source checkout, remote, commit, ref, source version, sync instant,
and a version plus content hash per skill.

## Belongs here

- The manifest schema (`schemaVersion`, `source`, `syncedAt`, `skills`).
- Decoding with an explicit state per failure mode:
  - `absent` — no `.agents/skills` directory.
  - `unmanaged` — a store without a manifest (pre-manifest install).
  - `corrupt` — the manifest exists but is not JSON or not the v1 shape.
  - `unreadable` — the manifest cannot be read (permissions, a directory).
  - `unsupported` — `schemaVersion` differs from `SCHEMA_VERSION`, checked
    before the full shape so a future schema is not mislabelled corrupt.
  - `managed` — a decoded v1 manifest.
- SHA-256 hashing of a skill's files (sorted, deterministic) and stable
  serialization that ignores `syncedAt` for equality.
- Writing a manifest under `<workspace>/.agents/skills`.
- Path helpers for the store and its manifest file.

## Does not belong here

- Deciding when to write or refresh a manifest (owned by `mf-skills sync`).
- Deciding drift (`current`/`stale`/`diverged`); that compares a manifest to a
  checkout and belongs with the sync engine.
- Rendering; the CLI module owns the human and JSON forms.
