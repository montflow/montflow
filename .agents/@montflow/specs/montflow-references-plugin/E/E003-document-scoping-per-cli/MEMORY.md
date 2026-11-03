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

The CLI guide carries the scoped-verification section and per-CLI table (`.agents/documentation/author-mf-utility-cli.md`), and the whole-store forms are labelled CI. Evidence: commits `731183cc` and `1300bb9d`. Per-package READMEs do not each restate their scoped command, so that item stays unchecked.

## B002 retrofit evidence

- 2026-11-02: B002 verified this completed record against this MEMORY, its commits, and the diff.
- Store gate re-run at HEAD: `bun run ts:check`, `bun run lint:check`, `bun run fmt:check`, `bun run test`, and `bun run mf:check` all exit 0; results are quoted in `montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md`.
Gate items: checked against the runs recorded here and at HEAD.

## B002 gate retirement notes

Re-audited 2026-11-03 against HEAD.

- `skills`, `prompts`, `specs`, `profiles`, `reviews`, and `references` READMEs
  show their scoped command — not true at HEAD: several package READMEs do not
  restate a scoped command (the scoped table lives in
  `.agents/documentation/author-mf-utility-cli.md`). Left unchecked, not ticked.
- each CLI `CONTEXT.md` shows the scoped command or links to the README section
  — not true at HEAD for every CLI. Left unchecked, not ticked.
