# Memory

## Context

Audited every `mf-*` CLI against its own `--help` and ran each scoped form from the repo root.

## Progress

- complete

### Scoped invocation table

| CLI | Binary | Single-artifact form | Notes |
| --- | --- | --- | --- |
| skills | `mf-skills` | `bun run --cwd packages/skills cli verify <name> --dir $PWD` | package-wide form is `verify --dir $PWD` |
| prompts | `mf-prompts` | `bun run --cwd packages/prompts cli verify <name> --dir $PWD` | `--all` for the store |
| specs | `mf-specs` | `bun run --cwd packages/specs cli check --name <spec> --dir $PWD` | `check` is the verify verb |
| profiles | `mf-profiles` | `bun run --cwd packages/profiles cli verify <name> --dir $PWD` | |
| reviews | `mf-reviews` | `bun run --cwd packages/reviews cli verify <series> --dir $PWD` | `--all` for the store |
| references | `mf-references` | `bun run --cwd packages/references cli verify <slug> --dir $PWD` | `--all` for the store |

- Every scoped command ran successfully against a real artifact; `--dir $PWD` is the workspace root, not the store.
- `AGENTS.md` already states the rule unconditionally; the stale exceptions are the mechanical-doc examples that still show `mf:check:<domain>` for one artifact (fixed in E003's doc section).
- Docs carrying verification examples: `AGENTS.md`, `.agents/documentation/author-mf-utility-cli.md`, package READMEs, CI workflow, Lefthook.
- Global forms (`mf:check:<domain>`, `mf:gate`) belong to CI and cross-scope changes only.
- Doc-guard decision: no new guard script. The scope is six CLIs and a handful of docs; a regex guard would either false-positive on CI/gate examples or need its own allow-list, and the docs now live in one table. Recorded as not worth its cost.

## Open Questions

- None.

## Handoff

- E002 applies the unconditional rule; E003 documents the table.

## Deviations

- None.
