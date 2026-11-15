---
name: skills-sync-exclude-config
status: in-progress
workspace-type: worktree
author: Daniel Montilla
created: 2026-11-15
spec-version: 2
---

# skills-sync-exclude-config

## Description

`mf-skills sync --check` treats every public skill in the montflow checkout as
required. Each public `SKILL.md` must exist in the target `.agents/skills/` with
identical content, or the check reports drift. The only way to opt a skill out
today is `metadata.internal: true` in that skill's own frontmatter — a change to
montflow itself that applies to every consumer. A consumer has no way to opt
out, so it cannot drop or replace a public skill (for example one the team
replaces with a repo-specific skill) without failing the gate, and it cannot
remove a skill that other skills link to either.

Observed in verdez, where `tooling/mf:check:skills` runs `sync --check`, then
`verify`, then `doctor --check`: deleting `montflow-typescript-testing` locally
makes `sync --check` report `Created (1) montflow-typescript-testing` and
`drift — 1 skill would change`, exit 1. The same full set is enforced by
`verify` and `doctor --check`.

This spec adds an optional config file read from the **target workspace** (not
the montflow checkout), so each repo decides its own exclusions:

```json
{ "exclude": ["montflow-typescript-testing"] }
```

The file lives at `.agents/@montflow/skills/config.json` in the workspace store.
The config belongs to montflow, so it sits in a montflow-owned folder under the
workspace store; each consumer repo owns the file, and the montflow checkout is
left untouched.

### Behavior

- `sync` reads `.agents/@montflow/skills/config.json` from the target workspace
  and skips every excluded public skill with outcome `skipped` and reason
  `excluded`.
- `sync --check`, `verify`, and `doctor --check` ignore excluded skills: they
  are never reported as drift or missing, so a consumer can exclude a public
  skill and `tooling/mf:check:skills` passes with it excluded.
- A local copy of an excluded skill is left in place untouched — excluding a
  skill never deletes or modifies its local copy. An existing local copy is
  treated exactly as a local-only skill already is.
- An unknown name in `exclude` (one that names no public skill in the source
  checkout) produces a **warning**, never an error, because skills get renamed
  upstream. A missing config file changes no behavior: with no config, the
  current full-set enforcement is unchanged.

### Why the target workspace rather than a montflow-side config

A montflow-side config would make the exclusion decision for every consumer at
once, which is exactly the problem this spec solves. The target-workspace file
lets each repo decide. A montflow-side default file, overridable by
`.agents/@montflow/skills/config.json`, is a reasonable alternative if the
maintainers prefer it; the target-workspace location in the issue's proposal is
the primary design this spec specifies, and the alternative is recorded in
`## Creation` as a decided, deferred option rather than an open question.

### Acceptance criteria (from the issue)

- A consumer can exclude a public skill without editing montflow, and
  `tooling/mf:check:skills` passes with it excluded.
- Excluding a skill does not delete or modify its local copy.
- A test covers an excluded skill, an unknown name in `exclude`, and a missing
  config file (no behavior change).

### Plan

One phase (`A`) decomposes the change into three sequential tasks, each building
on the prior one's output (config reading → sync/verify/doctor behavior → tests):

- **A001 read-sync-exclude-config** — read the optional
  `.agents/@montflow/skills/config.json` from the target workspace and parse
  the `exclude` list. Unknown names warn, not error; a missing config file
  means no behavior change.
- **A002 skip-excluded-skills** — make `sync` skip excluded skills with outcome
  `skipped` / reason `excluded`, leave any local copy in place, and make
  `sync --check`, `verify`, and `doctor --check` ignore them.
- **A003 add-exclusion-tests** — tests covering an excluded skill, an unknown
  name in `exclude`, and a missing config file.

## Requirements

- `mf-skills sync` reads the optional `.agents/@montflow/skills/config.json` from the **target workspace** (the `--target`/`--dir` root), never from the montflow source checkout.
- The config is a JSON object with an `exclude` list of skill names. A name in `exclude` that matches no public skill in the source checkout emits a warning, never an error. A missing config file, or one with an empty/absent `exclude`, changes no behavior.
- `sync` skips every excluded public skill with outcome `skipped` and reason `excluded`, reported alongside the existing `internal` skips. The skill is never written to the target, and an existing local copy of it in the target store is left byte-identical.
- `sync --check`, `verify`, and `doctor --check` never report an excluded skill as drift or missing, so a consumer that excludes a public skill gets a clean check.
- Excluding a skill never deletes, overwrites, or otherwise modifies its local copy in the target `.agents/skills/`.
- Existing behavior is unchanged when no config file exists, and the existing `internal` (frontmatter) skip path is untouched.
- The binary (`mf-skills sync`) and the slash (`/mf-skills sync`) surfaces share the same exclusion behavior and report.
- A test suite covers: a skill excluded by name (reported `skipped`/`excluded`, local copy preserved, clean check), an unknown name in `exclude` (warning, run still succeeds), and a missing config file (no behavior change).
- Every execution task passes its `GATES.md`.

## Creation

- rigor: light
- questions 0/1
- unresolved: none

Decisions recorded here (no authoring questions were required):

- **Rigor `light`**: a single-package, focused behavior change with explicit
  acceptance criteria and tests; one phase, three execution tasks, review waived
  (permitted at `light`), within the four-task ceiling.
- **Config location**: the issue's proposal —
  `.agents/@montflow/skills/config.json` in the target workspace. The stated
  alternative (a montflow-side default file overridable by that path) is
  recorded here as the fallback the maintainers may choose; it does not change
  the spec's phases.
- **Config ownership**: the file belongs to montflow and sits under the
  montflow-owned `.agents/@montflow/skills/` folder of the workspace store, but
  its contents are written by the consumer. The sync engine treats it as
  read-only input.
- **Three tasks**: the config read (A001), the skip/ignore behavior across
  `sync`, `sync --check`, `verify`, and `doctor --check` (A002), and the tests
  (A003) are a genuine serial chain — each consumes the prior task's output — so
  they are sequenced with `depends-on` edges and a stated `serial-reason`, not
  fanned out.

## Tasks

| ID | Name | Type | Status | Gates |
| --- | --- | --- | --- | --- |
| A001 | read-sync-exclude-config | execution | pending | Yes |
| A002 | skip-excluded-skills | execution | pending | Yes |
| A003 | add-exclusion-tests | execution | pending | Yes |