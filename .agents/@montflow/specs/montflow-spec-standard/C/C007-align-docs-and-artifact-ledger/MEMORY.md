# Memory

## Context

C007 aligns every live document with the v2 spec standard shipped by
C001–C006, C008, and C009: the phase tree, the generator verbs, the CLI/slash/
host/TUI surfaces, the payload manifest and its two doctor modes, the frozen-v1
read rule, and the live-store `migrate --all` result. Scope is live docs only:
`AGENTS.md`, guides, `packages/specs/README.md`, the specs wiki, the shipped
skills and their changelogs, the bookkeeper's artifact ledger, package
changelogs, and this `MEMORY.md`. No `SPEC.md`, `TASK.md`, `GATES.md`,
`PHASE.md`, review store, lock, frozen memory, or another task's file was
edited.

## Progress

- 2026-11-03: read `TASK.md`, C005/C006/C008/C009 memories, the bookkeeper
  profile, `AGENTS.md`, `guides/installation.md`, `packages/specs/README.md`,
  the specs/reviews skills, the specs wiki, the changelogs, and the live
  `SPEC.md` versions.
- 2026-11-03: added the `Specs (v2)` contract to `AGENTS.md`: phase tree,
  `spec-version` and the frozen-v1 read rule, the generator verbs, every
  surface, and the payload/doctor model.
- 2026-11-03: updated `guides/installation.md` for the phase tree, the specs
  doctor payload, and the profiles doctor that C004 added.
- 2026-11-03: rewrote the live spec contract in `packages/specs/README.md`: the
  layout, the CLI verbs, `/specs`/host/TUI parity, the payload manifest and
  report-versus-repair split, the review-cycle policy, the v1→v2 migration
  table, and the library surface.
- 2026-11-03: corrected both shipped specs skills (`montflow-create-specs`
  2.13.1, `montflow-find-specs` 1.5.1) and their changelogs, then reinstalled
  them with `mf-specs doctor`.
- 2026-11-03: added four specs wiki pages and the index: specs, phases, verbs,
  and payload.
- 2026-11-03: extended the bookkeeper artifact ledger with a tier row, a
  payload-kind table, the two doctor modes, the spec v2 surface list (binary,
  `/specs`, host tools, TUI; readers, writers, and the two write-nothing verbs),
  and C005's per-spec migration record.
- 2026-11-03: added `Unreleased` entries to every package whose behavior changed
  (`specs`, `profiles`, `prompts`, `skills`, `reviews`, `references`) and new
  changelogs for `payload` and `model-fallback`; breaking changes are marked.
- 2026-11-03: updated `.agents/documentation/author-mf-utility-cli.md` to the
  real specs verb list and the manifest doctor.
- 2026-11-03: ran the audit, the artifact verifiers, `mf:check`, and the
  typecheck/lint/format gates; all pass.

## Findings

### Docs now state the v2 contract

- **Layout.** `SPEC.md` + optional `sizing.json` + one directory per phase.
  Phase dir: `PHASE.md`, `MEMORY.md`, `BOARD.md`, optional `GATES.md` and
  `GATE-RESULTS.jsonl`, plus task dirs. Task dir: `TASK.md`, `MEMORY.md`,
  optional `GATES.md`, `MAILBOX.md`, `GATE-RESULTS.jsonl`.
- **Phase is a directory.** No live doc calls a phase the leading letters of a
  task id. `montflow-create-specs` no longer calls the phase directory a "pure
  container"; it names `PHASE.md` and the channels.
- **No stored lock list.** Every mention says the lock is derived and that
  `mf-specs lock` only confirms it. The audit for `locked-phases` and
  hand-written lock wording returns no matches.
- **No "no lock verb / no gate runner" claim.** The audit for `no lock verb`,
  `has no lock`, `no gate runner`, and `cannot run gates` returns no matches.
- **v1 read rule.** Docs state that absent `spec-version` reads as v1 with a
  `spec.version-outdated` warning, that v2 is never inferred from file
  presence, that a complete spec is frozen, and that
  `migrate --include-complete` is the only upgrade path.
- **Surfaces.** The binary list is the CLI help list (27 heads including
  `review`); `/specs` mirrors the command verbs, with `review decide`, `doctor`,
  and `version` binary-only; host tools are
  `spec_author`/`spec_execute`/`spec_sizing`/`spec_tier`/`spec_models`; the TUI
  picker offers only directories holding `SPEC.md`.

### Ledger

`packages/specs/payload.json` and the other package manifests are recorded as
the only name lists. The bookkeeper table now has a `Tiers` row and a payload
kind table for `skill`, `profile`, `prompt`, and `tier`; profiles and prompts
are named as payload kinds. It records the split explicitly:

- `doctor --check` = report-only, statuses `ok|missing|stale|mismatched|blocked`,
  no writes and no directory creation, used by every `mf-<cli>:check`.
- `doctor` = repair, statuses `present|installed|repaired|blocked`, used by
  `mf:doctor`.

### C005 migration result recorded

From the live `mf-specs migrate --all` output (also in `packages/specs/README.md`):

```text
14 specs · 0 migrated · 2 upgraded · 0 planned · 12 frozen · 0 failed
```

| Spec                            | Result            | Version after |
| ------------------------------- | ----------------- | ------------- |
| `cli-version-awareness`         | frozen (complete) | 1             |
| `installation-guide`            | frozen (complete) | 1             |
| `model-fallback-alignment`      | frozen (complete) | 1             |
| `montflow-ci-verification`      | frozen (complete) | 1             |
| `montflow-multi-reviewer`       | frozen (complete) | 1             |
| `montflow-opencode-migration`   | frozen (complete) | 1             |
| `montflow-phase-directories`    | frozen (complete) | 1             |
| `montflow-project-structure`    | frozen (complete) | 1             |
| `montflow-references-plugin`    | frozen (complete) | 1             |
| `montflow-references-tui`       | upgraded          | 2             |
| `montflow-spec-completion-gate` | frozen (complete) | 1             |
| `montflow-spec-standard`        | upgraded          | 2             |
| `plugin-host-integration`       | frozen (complete) | 1             |
| `spec-optimizations`            | frozen (complete) | 1             |

`montflow-references-tui` and `montflow-spec-standard` read
`spec-version: 2`; the other 12 are `status: complete` and read v1.

### Changelog coverage

| Package | Entry |
| --- | --- |
| `specs` | v2 tree, generator verbs, gates, review decide, surfaces, tiers, breaking removals |
| `payload` | new manifest + shared install engine + shared embed generator |
| `profiles` | profile payload, `mf-profiles doctor`, v2 profiles, review decide wiring |
| `prompts` | manifest doctor, shared engine, status vocabulary |
| `skills` | manifest doctor, shared engine, internal-skill skip |
| `reviews` | manifest doctor, review policy documentation |
| `references` | manifest doctor, shared status vocabulary |
| `model-fallback` | prompt payload, `mf-model-fallback doctor [--check]` |

No entry was added to an unchanged package (`core`, `format`, `linting`,
`opencode`, `stlx`, `version`, `workspace`, `workflows`).

## Gates (verbatim, repo root, 2026-11-03)

Full logs: `/tmp/opencode/c007-gates/`. Exit codes are the command exits.

### `bun run mf:check` — EXIT 0

```text
release guard: 6 CLIs at 0.0.2, one fixed group, tags on
46 skills · 0 issues
5 prompts · 0 issues · 0 warnings
14 specs · 0 failed · 0 issues · 13 warnings
12 profiles · 0 issues · 0 warnings
2 files · 0 issues
summary entries=14 issues=0 warnings=0
summary checks=8 failed=0 repaired=0
```

### `bun run mf-specs:check` — EXIT 0

```text
14 specs · 0 failed · 0 issues · 13 warnings
✓ spec skills and prompts are installed and up to date.
✓ montflow-create-specs: up to date → /home/daniel/dev/montflow/spec-standard/.agents/skills/montflow-create-specs
✓ montflow-find-specs: up to date → /home/daniel/dev/montflow/spec-standard/.agents/skills/montflow-find-specs
✓ spec-create: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/prompts/spec-create.json
✓ spec-execute: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/prompts/spec-execute.json
✓ spec-sizing: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/prompts/spec-sizing.json
✓ micro: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/tiers/micro.md
✓ standard: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/tiers/standard.md
✓ full: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/tiers/full.md
```

The 13 warnings are the 12 frozen-v1 `spec.version-outdated` warnings plus
`phase.review-task-missing` on `montflow-spec-standard/D/PHASE.md`.

### `bun run mf-skills:check` — EXIT 0

```text
46 skills · 0 issues
✓ skills are installed and up to date.
✓ montflow-create-skills: up to date → /home/daniel/dev/montflow/spec-standard/.agents/skills/montflow-create-skills
✓ montflow-modify-skills: up to date → /home/daniel/dev/montflow/spec-standard/.agents/skills/montflow-modify-skills
```

### `bun run mf-profiles:check` — EXIT 0

```text
12 profiles · 0 issues · 0 warnings
✓ profiles are installed and up to date.
✓ spec-appraiser: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/profiles/spec-appraiser
✓ spec-bookkeeper: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/profiles/spec-bookkeeper
✓ spec-creation-orchestrator: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/profiles/spec-creation-orchestrator
✓ spec-execution-orchestrator: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/profiles/spec-execution-orchestrator
✓ spec-worker: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/profiles/spec-worker
✓ spec-sizing-orchestrator: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/profiles/spec-sizing-orchestrator
```

### `bun run mf-prompts:check` — EXIT 0

```text
5 prompts · 0 issues · 0 warnings
✓ prompts skills are installed and up to date.
```

### `bun run mf-reviews:check` — EXIT 0

```text
2 files · 0 issues
✓ review skills are installed and up to date.
```

### `bun run ts:check` — EXIT 0

```text
 Tasks:    17 successful, 17 total
```

### `bun run lint:check` — EXIT 0

```text
 Tasks:    17 successful, 17 total
```

### `bun run fmt:check` — EXIT 0

```text
 Tasks:    17 successful, 17 total
```

## Completion evidence

- **No phase-as-task-id-prefix or hand-written lock list.** The audit
  `grep -rniE 'phase (is|as) (the )?(leading|first) letters|phase.*task-id
  prefix|hand-written lock|locked-phases'` over `AGENTS.md`, `README.md`,
  `guides/`, `packages/specs/README.md`, `packages/specs/wiki`,
  `packages/specs/skills`, `packages/specs/prompts`, `packages/reviews/skills`,
  `packages/profiles/profiles`, `.agents/@montflow/profiles`,
  `.agents/skills/montflow-*`, and `.agents/documentation` returns no matches
  (grep exit 1).
- **No "no lock verb / no gate runner" claim.** A second audit over the same
  set for `no lock verb|has no lock|no gate runner|cannot run gates` returns no
  matches.
- **Every spec is v2 or frozen.** The 14 `SPEC.md` files read: 2 with
  `spec-version: 2` (`montflow-spec-standard`, `montflow-references-tui`) and 12
  with no version and `status: complete`; the ledger records C005's per-spec
  result and states that absence reads as v1 with a warning.
- **Skills, profiles, and prompts verify.** `mf-skills:check`,
  `mf-profiles:check`, and `mf-prompts:check` all exit 0 with zero issues.
- **Changelogs.** Entries exist for all eight packages whose behavior changed;
  no entry exists for an unchanged package.
- **`bun run mf:check` passes end to end** (`summary checks=8 failed=0
  repaired=0`, exit 0), and `ts:check`, `lint:check`, and `fmt:check` all exit 0.

## Open Questions

- None blocking. The frozen v1 specs keep their historical `*099` review tasks
  and `spec.version-outdated` warnings by design; the docs say so. The
  `montflow-spec-standard/D` `phase.review-task-missing` warning is historical
  and outside C007's write scope.

## Handoff

- **C099** can review the docs and ledger against the v2 store; every changed
  package has a changelog entry and the ledger carries the migration table.
- A future phase that changes a package's user-visible behavior must add an
  `Unreleased` entry; `mf:check` already guards the six fixed-group changelogs
  through `mf-release:check`.
- The specs wiki now lives at `packages/specs/wiki/`; link new pages from its
  `index.md`.

## Deviations

- Added `CHANGELOG.md` to `packages/payload` and `packages/model-fallback`
  because both changed behavior in Phase C and the changelog skill says to
  create the file when missing. Neither package is in the changeset fixed group,
  so `mf-release:check` does not inspect them.
- The bookkeeper ledger carries the one-time migration table because `TASK.md`
  and B004 name that ledger as the record of C005's frozen/upgraded split.
- No `BOARD.md`/`MAILBOX.md` was written; the phase has no board and this run's
  write scope is docs, skills/profiles/prompts, the ledger, changelogs, and this
  `MEMORY.md`.
- No status, checkbox, lock, review store, `SPEC.md`, `PHASE.md`, or frozen
  decision memory was edited.

## Files touched

Live docs:

- `AGENTS.md`
- `guides/installation.md`
- `packages/specs/README.md`
- `packages/profiles/README.md`
- `packages/reviews/README.md`
- `packages/specs/wiki/index.md` (new)
- `packages/specs/wiki/specs.md` (new)
- `packages/specs/wiki/phases.md` (new)
- `packages/specs/wiki/verbs.md` (new)
- `packages/specs/wiki/payload.md` (new)
- `.agents/documentation/author-mf-utility-cli.md`

Skills (canonical + installed by `mf-specs doctor`):

- `packages/specs/skills/montflow-create-specs/SKILL.md`
- `packages/specs/skills/montflow-create-specs/CHANGELOG.md`
- `packages/specs/skills/montflow-find-specs/SKILL.md`
- `packages/specs/skills/montflow-find-specs/CHANGELOG.md`
- `.agents/skills/montflow-create-specs/{SKILL.md,CHANGELOG.md}`
- `.agents/skills/montflow-find-specs/{SKILL.md,CHANGELOG.md}`

Ledger:

- `.agents/@montflow/profiles/bookkeeper/PROFILE.md`

Changelogs:

- `packages/specs/CHANGELOG.md`
- `packages/profiles/CHANGELOG.md`
- `packages/prompts/CHANGELOG.md`
- `packages/skills/CHANGELOG.md`
- `packages/reviews/CHANGELOG.md`
- `packages/references/CHANGELOG.md`
- `packages/payload/CHANGELOG.md` (new)
- `packages/model-fallback/CHANGELOG.md` (new)

Task record:

- `.agents/@montflow/specs/montflow-spec-standard/C/C007-align-docs-and-artifact-ledger/MEMORY.md`

## Orchestrator Verification (2026-11-03)

Independent verifier run from the repo root after the worker receipt:

```
$ bun run mf:check
46 skills · 0 issues
5 prompts · 0 issues · 0 warnings
14 specs · 0 failed · 0 issues · 13 warnings
12 profiles · 0 issues · 0 warnings
2 files · 0 issues
summary entries=14 issues=0 warnings=0
summary checks=8 failed=0 repaired=0
EXIT=0

$ bun run mf:gate:fast   # lint + fmt + ts + mf:check
 Tasks:    17 successful, 17 total   (lint)
 Tasks:    17 successful, 17 total   (format)
 Tasks:    17 successful, 17 total   (ts)
summary entries=14 issues=0 warnings=0
summary checks=8 failed=0 repaired=0
EXIT=0
```

All completion items are supported; task recorded complete by the orchestrator.
