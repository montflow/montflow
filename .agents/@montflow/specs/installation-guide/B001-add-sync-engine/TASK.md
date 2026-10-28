---
id: B001
name: add-sync-engine
type: execution
originator: user
depends-on: A002
related-tasks: B002, B003
status: complete
---

# Task B001: add-sync-engine

## Type: execution

## Description

Add a `sync` engine to the skills package that publishes public skills from a
montflow checkout into a workspace skill store. The guide written in phase A
documents this command, so the implementation follows the guide's contract
rather than inventing one. The engine owns every domain rule — which skills are
public, what counts as drift, what a refusal says — so the binary and the slash
command stay thin.

Place it beside the existing doctor app (`packages/skills/src/apps/doctor/`) if
it needs filesystem helpers the CLI engine set does not already have, and export
it through the same module index the other front ends import.

## Requirements

- Read the source store from `--from <path>`, defaulting to the montflow
  repository the running package belongs to (the resolution `doctor` already
  uses to find shipped skills).
- Classify public vs internal from `SKILL.md` frontmatter: `metadata.internal:
  true` means internal, everything else is public.
- Copy every file in a public skill's directory, creating the target directory
  when absent and overwriting only files whose bytes differ.
- Return per-skill outcomes (`added`, `updated`, `unchanged`, `skipped`) plus
  the source and target paths, as data — no console output, no argv awareness.
- Fail with a displayable string naming a fix the reader can type, and accept an
  `invocation` so the refusal names `mf-skills sync` or `/mf-skills sync`.
- Support report-only mode: compute the same outcomes, write nothing.
- Do not delete target skills that are absent from the source.
- Cover the engine with unit tests over temp directories; no network, no
  reliance on this repository's own `.agents/skills` contents.

## Completion

- [ ] Engine exported from the package's module index.
- [ ] Outcomes and refusal text match the requirements above.
- [ ] Unit tests cover public filtering, idempotency, report-only mode, and a
      missing source.
