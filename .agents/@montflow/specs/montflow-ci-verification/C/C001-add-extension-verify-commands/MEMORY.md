# Memory

## Context

Task C001: add headless verify commands for every artifact-owning extension,
per B001 decisions 8–9. Closes the A099 F1 prompts flaw and the profiles
RPC-only gap.

## Progress

- 2026-10-07: complete.

## Findings

### Prompts — `verify --all`

- `PromptStore.readAllRaw(cwd, dir)` added: enumerates every raw `*.json` without
  decoding, so undecodable files are seen (the A099 F1 failure mode).
- `Engines.verifyAll(scope)` added: verifies each raw file with
  `Prompts.verifyPromptFile`, returns `{ entries, issueCount }`.
- `Renderers.verifyAll` added: failures always, passes only under `--verbose`.
- Binary `verify` now takes an optional `name` plus `--all`; a bare
  `verify` verifies the whole store.
- Slash `/mf-prompts` `verify` accepts `--all`/`--dir`, same engine.
- Proven: clean store `2 prompts · 0 issues` exit 0; a store with
  `broken.json` (not JSON) and `bad.json` (empty template) reports both,
  `2 prompts · 2 issues`, exit 1.

### Profiles — headless `mf-profiles`

- `ProfileStore.readAllRaw(cwd)` added: enumerates `*/PROFILE.md` without
  decoding (same fix as prompts; `ProfileStore.list` silently drops
  undecodable files).
- New `src/apps/cli/engines.apps.module.ts`: `verifyAll(cwd)` +
  `renderVerifyAll`.
- New `src/apps/cli/main.ts` binary + `cli`/`build:cli` package scripts;
  `--dir <root>` targets a repo. Proven: repo root `5 profiles · 0 issues`
  exit 0; a corrupt store reports `frontmatter: Missing frontmatter block.`
  exit 1.
- `TEMPLATE.md` is correctly ignored (not a valid profile dir name).

### `doctor --dir`

`mf-skills doctor` and `mf-prompts doctor` gained `--dir`, so the gate can
target the repo root instead of the package directory. Both report
`up to date` against this repo.

### Tests

- `pi-prompts`: `verify-all.test.ts` (lossy `list` stub proves `verifyAll`
  sees corrupt files) + updated stubs; 473 passed.
- `pi-profiles`: `engines.test.ts` (temp store with a corrupt profile);
  51 passed.

## Open Questions

- The slash `/mf-profiles-cli` still has only per-name `verify`; the headless
  binary is the gate path. A `verify --all` slash action is a possible follow-up.

## Handoff

- Feeds C002 add-verification-entrypoint.

## Deviations

- Also wired `--all` into the `/mf-prompts` slash front end for parity with the
  binary (the package's design rule: the two front ends cannot disagree).
