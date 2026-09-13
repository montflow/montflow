# Release Format Package

Publishes `@montflow/format` npm via Changesets.

## When

- PR touches `packages/format/**` targeting `main`.
- Each such PR requires one changeset file. No changeset → no release. Exception: first publish of never-published package needs no changeset; workflow publishes current version as-is.

## Steps

1. Run `bun run changeset` from repo root.
2. Select `@montflow/format`.
3. Select bump type: `patch` bugfix, `minor` new feature/export, `major` breaking change. Breaking change uncertain → ask owner before selecting `major`.
4. Write one-line summary describing user-facing change.
5. Commit generated `.changeset/<name>.md` with PR.
6. Merge PR into `main`. Release workflow opens/updates "Version Packages" PR.
7. Merge "Version Packages" PR. Workflow builds package, publishes npm.
8. Never version other workspaces. `.changeset/config.json` ignores all packages except `@montflow/format`.

## Verify

- `packages/format/CHANGELOG.md` contains new entry.
- npm shows new `@montflow/format` version.
- `bunx changeset status` reports no pending bumps.
