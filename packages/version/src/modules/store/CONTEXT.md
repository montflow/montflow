# Store

Reads the `mf-skills sync` manifest that records what an installed workspace
received: source checkout, remote, commit, ref, source version, sync instant,
and a version plus content hash per skill.

## Belongs here

- The manifest schema (`schemaVersion`, `source`, `syncedAt`, `skills`).
- Lenient decoding: absent store, pre-manifest store, and corrupt manifest are
  distinguishable states rather than thrown errors.
- Path helpers for `<workspace>/.agents/skills` and its manifest file.

## Does not belong here

- Writing or refreshing a manifest (owned by `mf-skills sync`).
- Deciding drift (`current`/`stale`/`diverged`); that compares a manifest to a
  checkout and belongs with the sync engine.
- Rendering; the CLI module owns the human and JSON forms.
