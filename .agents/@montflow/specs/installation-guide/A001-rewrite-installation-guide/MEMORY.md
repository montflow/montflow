# Memory

## Context

`guides/installation.md` was rewritten from scratch around the two modes readers
arrive in. Read the `adding-references` and `finding-references` skills first so
the remote-mode flow matches those pipelines.

## Progress

- Rewrote `guides/installation.md` (117 lines): intro with the two-mode table,
  remote mode first, explicit handoff, local mode (install, verify, CLIs), and a
  single pointer for private `@montflow/*` plugins.
- Remote mode mandates registering montflow via `adding-references` at
  `.agents/references/montflow`, then reading the inventory via
  `finding-references`, then handoff to local mode.
- Local mode documents `mf-skills sync --dir "$PWD"` plus `--check`, public vs
  internal (`metadata.internal: true`), per-skill outcomes, project-local
  discouragement of global installs, and `M=<path-to-checkout>`.
- CLIs documented as `bun run --cwd "$M/packages/<name>" cli ...` with
  `--dir <workspace-root>`; package names skills, specs, profiles, prompts,
  reviews.
- Removed every OpenCode-era section: plugin arrays, `opencode plugin add`,
  packing, `/reload`, dashboard, global config, skill-discovery tables,
  troubleshooting. No `npx skills` string anywhere.
- Verified links: both relative skill links and both in-page anchors resolve;
  no forbidden strings (`npx`, `opencode`, `reload`, `dashboard`, plugin add,
  packing, config dirs).
- Stage 0 in `packages/skills`: format:check, lint:check, ts:check, and test all
  green (40 files / 243 tests).
- Did not add the five utility install sections (phase C) and did not implement
  `mf-skills sync` (phase B); the guide states its contract.

## Open Questions

- None.

## Handoff

- A001 deliverable is complete. A002 retargets skill/README references; phase B
  implements `mf-skills sync` to match the contract in the guide; phase C adds
  the per-utility install sections.

## Deviations

- The primary documented form is
  `bun run --cwd "$M/packages/skills" cli sync --dir "$PWD"` so it is
  copy-pasteable without a global binary; one sentence notes the equivalent
  `mf-skills sync --dir "$PWD"` when the binary is on `PATH`.
- No link added for adapter docs because no adapter-doc page exists in the repo;
  the plugin pointer is a plain sentence.
