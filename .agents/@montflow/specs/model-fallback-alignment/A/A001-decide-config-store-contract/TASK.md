---
id: A001
name: decide-config-store-contract
type: planning
originator: user
depends-on:
related-tasks:
status: complete
---

# Task A001: Decide the config store contract

## Type: planning

## Description

Fix the file contract before any code moves, so the plugin, CLI, TUI face, prompt,
and verifier cannot disagree about the same bytes.

## Requirements

- Decide the exact path and file name, and whether the domain directory holds only `config.json` or room for future files.
- Decide the manifest shape: version field (and what an unknown version means), required versus optional keys, whether unknown keys are preserved, and the canonical ordering of `chain`.
- Decide the trigger field default and whether an explicit empty list is legal (disables fallback) or a shape error.
- Decide precedence and migration: store over options, when options are ignored, whether migration is explicit (`migrate`) or automatic on first write, and what happens when both disagree.
- Decide reload semantics: watch the file or the directory, debounce, keep-last-good on invalid, which log level reports each outcome, and how a deleted file is handled.
- Decide `status` output and exit codes for: missing file, malformed JSON, wrong types, empty chain, unknown trigger, duplicate model, legacy-only config, and both sources present.
- Record each decision with its rationale and the rejected alternatives in `MEMORY.md`, citing the current code paths it replaces.

## Completion

- [ ] Path, shape, and versioning recorded
- [ ] Precedence, migration, and reload semantics recorded
- [ ] `status` output and exit codes recorded
- [ ] Rejected alternatives recorded
