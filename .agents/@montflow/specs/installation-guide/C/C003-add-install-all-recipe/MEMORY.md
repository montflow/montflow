# Memory

## Context

Phase C003: the install-all recipe in `guides/installation.md`, for the `all`
answer to the selection flow.

## Progress

- Added Local mode step 4, "Install everything (all five)": one copy-paste bash
  block, fixed order skills → specs → prompts → profiles → reviews.
- `set -euo pipefail`; `step` echoes the utility; an `ERR` trap names the failed
  utility, prints the exit status and the completed work, and re-exits non-zero,
  so nothing after a failure runs and no exit is swallowed.
- Ends with a pasted summary: installed, verified clean, deferred, failed.
- Setup and verification only — no demo entries. Specs, prompts, and profiles
  verifiers do not tolerate a missing store, so their verifier runs only when the
  store exists; otherwise the utility is reported as deferred, not failed.
- Commands match the per-utility sections verbatim (checked by diffing the recipe
  lines against the section lines: zero recipe commands missing).
- Ran the extracted block in a scratch empty repo: exit 0, summary
  `Installed: skills specs prompts reviews`,
  `Verified clean: skills reviews`, `Deferred: specs prompts profiles`.
  After creating one spec, prompt, and profile: all five verified clean.
  Injected failure after `step specs`: exit 1,
  `FAILED: specs (exit 1). Nothing after it ran.`
- Documentation only; no script committed.

## Open Questions

- None.

## Handoff

- Profiles has no setup command, so it is reported as deferred until a first
  profile exists; do not move it into `installed` without a package `doctor`.
- If a verifier later tolerates an empty store, its `-d` guard can be dropped;
  the verifier command itself stays unchanged.

## Deviations

- The recipe adds store-existence guards around the specs, prompts, and profiles
  verifiers. The alternative — running them unconditionally — would abort
  install-all on an empty workspace, which is not a real failure. Failure exits
  are still unswallowed.
