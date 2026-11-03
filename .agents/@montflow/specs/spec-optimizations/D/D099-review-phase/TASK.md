---
id: D099
name: review-phase
type: review
originator: user
size: small
depends-on: D004
related-tasks:
reviewer-profiles: effect-reviewer
status: complete
---

# Task D099: Review phase

## Type: review

## Description

Run an independent adversarial review over phase D: the harness model
catalogue, the catalogue-aware config verification, the shipped `spec-sizing`
prompt and its role profile, and the `sizing-config` command, tool, and slash
wiring.

## Requirements

- Verify the model seam is additive: every existing consumer still compiles and
  behaves the same, and a host entry without variant data reports unknown
  variants rather than an empty list.
- Attack the catalogue: duplicate and unsorted entries, a provider with no
  models, a missing host context, a missing `--catalog` file, malformed JSON, and
  a `--json` round-trip. Each failure must name a code and a concrete fix.
- Attack `models --verify`: one unknown model, one unknown effort, one model
  with `null` variants, one with `[]`, a repo-only scope, and a spec with no
  config. Findings must aggregate in one pass, stay warnings, and render through
  the shared diagnostic shape. No finding may come from an unknown variant list.
- Attack the wizard order: it must show the existing config before asking
  anything, ask for scope only when `scope` is empty, propose all four sizes and
  the exact path before writing, write only after confirmation, and let the
  unsupervised branch decide and record instead of asking. A path that writes
  before the scope or proposal is a finding.
- Attack the prompt: every variable is declared and in first-appearance order,
  the template contains no model id or effort token of its own, no skill body is
  inlined, and open, repo, spec, and phase branches render the right path. Verify
  the `null` / `[]` / known-variant rule is unambiguous and that `inherit` is a
  legitimate decision.
- Attack the command: the open scope, every fixed scope, each conflict, an
  invalid mode, a missing prompt, and a stale prompt. Confirm that no run writes
  a config file and that the doctor gate fails before rendering.
- Verify the prompt and command access path: `spec_models` (list and verify) and
  the binary agree, the prompt reads the catalogue through that surface only,
  and no fallback invents a model when the host provides no catalogue.
- Verify `author`, `execute`, `which`, and the existing doctor behaviour are
  unchanged, and that `sizing-config`, `spec_sizing`, and `/specs sizing-config`
  all use one executor.
- Verify the write contract on a fixture host: an unrelated size and an
  unrelated `phases` entry survive a merge, the repo file never gains `phases`,
  the key order is stable, and an unchanged layer writes nothing. Confirm the
  phase never edits a task size or a spec record.
- Verify the profile and docs: `spec-sizing-orchestrator` matches the prompt's
  role, the creation and execution profiles hand off without guessing a model,
  and the authoring skill mirror is byte-identical.
- Verify no real `sizing.json` or invented model id was committed as test data.
- Write findings as the phase review round and resolve or escalate them before
  the phase is locked.

## Completion

- [x] All findings are resolved or escalated with a reason
- [x] Catalogue, verification, prompt, and command attacks were exercised and recorded
- [x] The merge-and-prove write contract was exercised end to end on a fixture
- [x] `bun run mf:gate` passes
- [x] The review round is linked with `- Phase: D`
