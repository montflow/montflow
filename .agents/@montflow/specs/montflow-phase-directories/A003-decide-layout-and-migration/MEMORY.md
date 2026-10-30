# Memory

## Context

Task A003: decide the layout grammar and the transformation path. This spec
splits with `montflow-spec-standard/C001` (user decision, 2026-10-28); the
decision below is normative for every later task. `related-tasks: C001` points
at the `montflow-spec-standard` task of that id.

## Progress

- 2026-10-28: complete. Decision recorded; no file outside this spec changed.

## Findings

### 1. Layout grammar (normative)

- Every task directory is `<spec>/<PHASE>/<PHASE><NNN>-<kebab-name>/`.
- `<PHASE>` is the task id's leading letters and must match `PHASE_PATTERN`
  (`A`–`ZZ`). One phase directory per phase token; `AA/AA012-…` is valid.
- The spec root holds `SPEC.md` plus phase directories and nothing else.
- A phase directory holds task directories and nothing else.
- A task directory holds `TASK.md` and `MEMORY.md`, plus `GATES.md` only when
  the task table's Gates column is `Yes`, and nothing else, including no
  subdirectory.
- A path deeper than three segments is an error.

### 2. Phase contract (normative)

- The phase directory is a **pure container** in this spec. It carries no
  `PHASE.md`, no phase gate, no phase memory, no board, no mailbox.
- The phase's objective, status, review decision, gate kind, and derived lock are
  `montflow-spec-standard/C001`'s contract. This spec's allowlist is one constant
  table; C001 extends it when `PHASE.md` lands.
- The reserved `<PHASE>099-review-phase` task stays exactly one per phase and
  moves under its phase directory.

### 3. Transformation path (normative)

- One `mf-specs migrate --name <spec>` (and `--all`) verb rewrites a flat spec
  into the layout. File contents are never edited. A mixed tree is refused.
- Until the seven repository trees are migrated, a task directory at the spec root
  is a **warning** whose message names the target path and whose `fix` states the
  move. D003 deletes that branch and emits the error instead.
- There is **no layout version field**. `SPEC.md` versioning is
  `montflow-spec-standard/C001`'s; adding one here would duplicate that decision
  and leave two migration mechanisms.
- The four fixtures move with the verifier (C002) so no fixture asserts a legacy
  tree; D002 adds `mock-legacy` (warning) and `mock-stray` (error) to cover both
  states explicitly.

### 4. Ours / C001's split (normative)

| Artifact | Ours | `montflow-spec-standard/C001` |
| --- | --- | --- |
| Task-directory placement and the per-level allowlist | yes | extends the table for `PHASE.md` |
| Snapshot directory entries (`kind`) | yes | — |
| Phase directory naming/grammar | yes | phase id read from `PHASE.md` later, dir name stays |
| `mf-specs create` emitting the layout | yes | — |
| `mf-specs migrate` + warning→error | yes | — |
| Migration of the seven existing specs | yes | — |
| Fixtures, tests, README, `CONTEXT.md` for the layout | yes | — |
| `montflow-create-pi-specs` layout rules (both copies) | yes | — |
| `SPEC.md` `version` field and its warn/error rule | no | yes |
| `PHASE.md` parse/verify | no | yes |
| Derived phase locks | no | yes |
| Review required-or-waived as a `PHASE.md` field | no | yes |
| Deleting `<PHASE>099-review-phase` and its check | no | yes |
| Moving tasks under phases and per-phase numbering | yes (D001) | must drop its "tasks move under their phase" requirement and consume this layout |
| Removing `locked-phases` and the contradiction state | no | yes |

### 5. Consequences

- `locked-phases:` stays empty in this spec's own `SPEC.md`; the verifier keeps
  checking that a listed phase exists, now against phase directories.
- `review-link` and `lifecycle` are not edited: phases still derive from task ids
  and the directory letters match those ids until C001 changes the rule.
- The seven trees migrate in D001, this spec's own tree included; until then the
  repository gate sees warnings, never errors.
- If C001 lands first, it extends the allowlist and may add `PHASE.md`; this
  spec's grammar still holds because the phase directory name is unchanged.

## Open Questions

- None.

## Handoff

- B001 fixes the finding table; B002 fixes the tooling/rollout; C001–C003 and
  D001–D004 implement within this decision.

## Deviations

- None.
