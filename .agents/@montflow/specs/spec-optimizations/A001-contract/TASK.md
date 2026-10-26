---
id: A001
name: contract
type: execution
originator: user
size: medium
depends-on:
related-tasks:
status: complete
---

# Task A001: contract

## Type: execution

## Description

Introduce the sizing vocabulary and the pure engine behind it: the four sizes,
the `size` field on a task, the layered `sizing.json` schema, verification, and
the merged resolver. This task lands the contract every later task consumes; it
does not change CLI output.

## Requirements

- Add a `modules/sizing` module with one source of truth for `SIZES`
  (`tiny`, `small`, `medium`, `large`), its `Size` schema, the size-entry and
  config shapes, and pure parse, verify, merge, and resolve helpers. Export it
  from `modules/index.ts` and the package index.
- Add the review-cycle contract to the same module: `REVIEW_CYCLES` maps `tiny`
  to 1, `small` to 2, `medium` to 3, and `large` to 3; a hard cap of 3 applies
  to every size. `phaseReviewBudget(sizes)` returns the largest non-review task
  budget in the phase, capped at 3, so a tiny-only phase gets 1 and the phase's
  own review task never raises the budget.
- Unit-test the mapping, the phase maximum, a phase mixing tiny and medium, the
  review task being excluded, and that no input can produce more than 3.
- Extend the `Task` schema and `verifyTaskFile` with `size`: unknown values are
  errors; a missing size is an error for `pending`, `in-progress`, and `blocked`
  tasks and a warning for `complete` tasks. Do not add a size column to the
  `SPEC.md` task table.
- Define the config contract: `.agents/@montflow/specs/sizing.json` (repo, no
  `phases`) and `<spec>/sizing.json` (spec, optional nested
  `phases.<PHASE>.sizes`). An entry requires `model` shaped as `provider/model`;
  `effort` is optional and must be a non-empty variant token. Unknown keys,
  unknown sizes, non-object entries, and malformed values are errors.
- Treat the repo config as a root file, not a spec: `list` and `check` must not
  enumerate `sizing.json` as a spec, and a repo-only config must verify and
  resolve without any spec-level file.
- Model every effectful sizing failure as a `Data.TaggedError` carrying at least
  `operation`, `path`, `field`, `code`, and the original `cause` when one exists.
  Decode with `Effect`'s Schema decode effect; never use a synchronous
  throw-and-catch or stringify the cause before it reaches the boundary.
- Extend the shared `Issue` with an optional stable `code` and have sizing
  findings carry `code`, `field`, `message`, `expected`, `actual` where relevant,
  and a concrete `fix`. Existing findings without a code keep working.
- Unit tests assert the stable codes, the preserved cause, and the fix text for
  malformed JSON, unknown size, missing model, malformed model id, effort
  without a model, and unknown phase.
- Merge repo -> spec -> phase; for a size, the most specific layer replaces the
  whole entry. Resolution returns the target (`provider/model#effort`) plus its
  source layer, or `inherit` when no layer defines that size.
- Allow `sizing.json` as the one permitted spec-root file in the structure
  verifier, and verify a spec's config there. Add the store read the CLI needs
  for the repo-level file.
- Make `mf-specs create` emit `size` on every scaffolded task and accept
  `name[:type[:gates[:size]]]`, defaulting to `medium` when omitted.
- Cover the module and the new task rules with unit tests: parse/verify failures,
  precedence and whole-entry replacement, inherit fallback, pending vs complete
  size enforcement, structure allowance, and scaffold emission.

## Completion

- [ ] `bun run --cwd packages/specs test` passes
- [ ] `bun run --cwd packages/specs lint:check`, `format:check`, and `ts:check` pass
- [ ] `bun run --cwd packages/specs cli check --dir "$PWD" --name spec-optimizations` reports zero issues
- [ ] A fixture config proves repo < spec < phase precedence and inherit fallback
- [ ] Tests prove tiny→1, small→2, medium→3, large→3, a tiny-only phase →1, a review task never raising the budget, and a hard cap of 3
- [ ] A repo-only fixture at the specs root verifies and resolves, and is not listed as a spec
- [ ] Error tests assert codes, expected/actual, and preserved causes, not only failure
