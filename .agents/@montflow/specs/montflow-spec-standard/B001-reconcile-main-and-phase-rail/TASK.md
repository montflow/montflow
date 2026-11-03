---
id: B001
name: reconcile-main-and-phase-rail
type: execution
originator: user
size: large
depends-on: A001, A002, A003
related-tasks: B002, B003, B004, B005
status: pending
---

# Task B001: reconcile main and the phase rail

## Type: execution

## Description

Main moved while this spec was paused. `spec-optimizations` shipped task sizes, the
sizing config and catalogue, the shipped `spec-create` / `spec-execute` /
`spec-sizing` prompts, the doctor module, review-cycle budgets, and the
`author` / `execute` / `sizing-config` / `models` / `which` verbs. The same period
reverted the phase-directory layout that `montflow-phase-directories` had already
landed, so every spec is flat again and the CLI and TUI still read a phase as the
leading letters of a task id.

This standard overrides main: keep the landed sizing, prompt, doctor, and
review-budget work, but restore the phase tree and remove the legacy state model
it replaced. Reconcile before Phase B decides anything so the decisions are made
against the tree that ships, not the flat tree that main happens to hold today.

## Requirements

- **Keep main's work.** The task size and review-cycle budget, `sizing.json` and
  the catalogue, the shipped prompts and `doctor`, the record checks, and the
  `author` / `execute` / `sizing-config` / `models` / `which` verbs stay. No later
  task may re-plan or duplicate them.
- **Restore the phase tree.** Re-land `<spec>/<PHASE>/<PHASE><NNN>-<kebab-name>/`
  from `montflow-phase-directories`: the directory-aware snapshot, the per-level
  allowlist, `create`, and a migration for every spec in the store, including this
  one. The merge that flattened the tree must not survive.
- **Delete the legacy state model.** Remove the hand-written `locked-phases`
  frontmatter, the reserved `<PHASE>099-review-phase` task and its structure
  check, and every CLI/TUI read that depends on either. A phase is complete when
  every task under it is complete; a phase is locked when it is complete and its
  review series holds a passing round attributed to that phase. The derived
  state is the only lock state.
- **Teach every CLI surface the tree.** `check`, `status`, `state`, `next`,
  `list`, `create`, `author`, `execute`, `sizing`, `resolve`, `models`, `which`,
  and `doctor` read the phase tree and the derived state. `state` no longer
  prints a stored lock list, `create` emits phase directories, and `next` derives
  the active phase from the tree. Slash forms and host tools keep parity.
- **Teach the TUI the tree.** The specs picker in `packages/specs/src/tui.ts`
  lists only directories that contain `SPEC.md`; it never offers a phase or task
  directory as a spec. The picker forwards the selected spec unchanged and its
  tests cover a store that holds phase directories.
- **Reconcile the plan and docs.** Update this spec's text and the B/C tasks for
  the merged repository: current package names (`packages/specs`, `profiles`,
  `prompts`), current gate scripts (`mf-<tool>:check`), and main's shipped verbs. The
  conflict resolution and anything intentionally dropped from main are recorded
  in `MEMORY.md`.
- **Accept `size: none` for completed records.** A `complete` task may declare `size: none` instead of a real size. `none` is a record opt-out, never a dispatch target: `status`, `next`, `resolve`, and `sizing` skip it without resolving a model. An unfinished task that declares `none` fails, and the complete-task missing-size fix points at `none`.
- **Stage the v2 delta.** `PHASE.md`, the version field, gate kinds, boards and
  mailboxes, and review waivers are still B004 decisions and C001 work. B001 lands
  the phase tree and the derived-state rail they sit on; it does not invent those
  contracts.

## Completion

- [ ] Every spec in the store sits under phase directories and `mf-specs check` is green with only historical warnings
- [ ] No live code, prompt, skill, or fixture reads `locked-phases` or requires a `<PHASE>099` review task
- [ ] `mf-specs status`, `state`, `next`, `list`, and the TUI picker agree on the active phase and derived lock state for this spec
- [ ] The TUI test covers a store with phase directories and never lists one as a spec
- [ ] `MEMORY.md` records what was kept from `spec-optimizations`, what was overridden, and the migrated spec list
- [ ] `ts:check`, `lint:check`, `fmt:check`, and `mf-specs:check` pass
