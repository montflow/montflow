# Memory

## Context

D003 makes `guides/updating.md` the single update destination every warning and
document points at.

Design:

- The guide covers reading the warning, updating the checkout (`git pull` +
  `bun install`), on-demand `version --check`, re-syncing an installed store
  (including `current`/`stale`/`diverged`/`unmanaged` and `--force`), verifying
  the result, and all three opt-outs.
- One `## mf-<cli>` section per CLI plus `## Installed stores`; each CLI section
  ends with `version --json`, a command that proves the update took effect.
- The network path is named as optional; every step works offline against a
  local checkout.
- `guides/installation.md` gained `## Updating`, and `README.md` links the guide
  beside the installation guide.
- `mf:check:release` now also fails when a CLI's notice anchor has no matching
  `## mf-<cli>` heading in the guide, so the link cannot rot silently.
- `syncing-skills` now describes the manifest and links the updating guide
  instead of only `--check`.

## Progress

- complete: full guide, installation/README links, anchor check + test,
  syncing-skills update.
- Verified: `mf:check:release` green, skills suite 433, version suite 154,
  `mf:check` green.

## Open Questions

- None.

## Handoff

- D099 reviews the documentation against the code one last time.

## Deviations

- The anchor check lives in the existing release scope rather than a new scope,
  so CI needs no extra matrix cell (the same rule C002 followed).

## B002 retrofit evidence

- 2026-11-02: B002 verified this completed record against this MEMORY, its commits, and the diff.
- Store gate re-run at HEAD: `bun run ts:check`, `bun run lint:check`, `bun run fmt:check`, `bun run test`, and `bun run mf:check` all exit 0; results are quoted in `montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md`.
Gate items: already recorded.
