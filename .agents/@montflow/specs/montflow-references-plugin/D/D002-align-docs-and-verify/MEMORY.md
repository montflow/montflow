# Memory

## Context

None yet.

## Progress

- pending

## Open Questions

- None.

## Handoff

- See TASK.md.

## Deviations

- None.

## Retrofit record

README, AGENTS, and the CLI guide describe the shipped surface. Evidence: commits `51a4dcaf docs(references): make the bootstrap runnable and finish the phase-D docs`, `f55efe47`, and `731183cc docs: complete the reference docs, scoping rule, and per-CLI table`. `INSTALL.md` was later deleted by the installation-guide spec, so the INSTALL half of the first item is no longer present; that item stays unchecked.

## B002 retrofit evidence

- 2026-11-02: B002 verified this completed record against this MEMORY, its commits, and the diff.
- Store gate re-run at HEAD: `bun run ts:check`, `bun run lint:check`, `bun run fmt:check`, `bun run test`, and `bun run mf:check` all exit 0; results are quoted in `montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md`.
Gate items: checked against the runs recorded here and at HEAD.

## B002 gate retirement notes

Re-audited 2026-11-03 against HEAD.

- INSTALL lists the plugin and its install command — retired: `INSTALL.md` was
  deleted by the installation-guide spec; the install command now lives in
  `guides/installation.md`. The historical INSTALL text is in commits
  `51a4dcaf`/`f55efe47`. Left unchecked, not ticked.
