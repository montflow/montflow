# Memory

## Context

Task D004: align the written contract with the tree — both `montflow-create-pi-specs`
copies, the injected authoring/executing text, the package and fixture READMEs,
and the CONTEXT files. A stale packaged copy fails `mf:check:skills`.

## Progress

- 2026-10-28: complete. `mf:check:skills` 46 skills / 0 issues and doctor
  up to date; `mf:check:specs` 7 specs / 0 issues.

## Findings

### 1. Skills

- `montflow-create-pi-specs` `3.0.0`: layout section (phase dir + task dir,
  per-level allowlist, no file at a phase level), scaffold step (nested output,
  phase A only, `migrate` for a flat tree), phase rules (phase directory named by
  its letters; task letters must match), self-check rows, and a `migrate` CLI
  reference. CHANGELOG has a breaking `3.0.0` entry.
- `montflow-find-pi-specs` `1.4.0`: the Reference line described "one directory
  per task"; now "one directory per phase, each holding its task directories".
  CHANGELOG entry added. This is the one extra edit beyond D004's plan.
- Both `.agents/skills/<name>/` copies and `packages/specs/skills/<name>/`
  copies are byte-identical (`diff -rq` clean).

### 2. Injected skill text

- `packages/specs/src/skills/authoring-spec.ts`: layout section, phase-directory
  rule, nested scaffold/migrate sentence.
- `packages/specs/src/skills/executing-spec.ts`: "Read `SPEC.md`, each phase
  directory, and every `TASK.md`."
- Review wording untouched (the `reviewer-profiles` contract is unchanged).

### 3. Docs

- `packages/specs/README.md`: `create` describes the nested layout; `migrate`
  added to the CLI list; `Structure`/`SpecStore` bullets updated; a
  "Migration: phase directories" section with the three migration steps.
- `packages/specs/fixtures/README.md`: five-fixture matrix, `migrate --dry-run`
  example (D002 started it, D003 removed `mock-legacy`).
- `modules/structure/CONTEXT.md`, `services/spec-store/CONTEXT.md`,
  `modules/task/CONTEXT.md`, `apps/cli/CONTEXT.md` updated for directories,
  `move`, the leaf-name argument, and the `migrate` engine/command.

### 4. Checks

- `bun run mf:check:skills` — 46 skills, 0 issues; doctor reports both spec
  skills current.
- `bun run mf:check:specs` — 7 specs, 0 failed, 0 issues.
- `bun run --cwd packages/specs test` — 56 files / 448 tests, no type errors.
- `bun run --cwd packages/specs lint:check` / `format:check` / `ts:check` — clean.
- `bun run --cwd packages/specs fixtures:check` — 5 specs, 3 documented failures.

## Open Questions

- None.

## Handoff

- The implementation is complete; the four phase reviews (A099, B099, C099,
  D099) remain pending because no independent reviewer could be dispatched in
  this session.

## Deviations

- Edited `montflow-find-pi-specs` although D004 planned to leave it: its
  Reference line stated the old one-level task layout, which is now false.
- `mock-legacy` was removed in D003, so the fixtures README ends at five
  fixtures rather than six.
