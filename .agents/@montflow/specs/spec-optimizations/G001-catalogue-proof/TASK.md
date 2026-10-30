---
id: G001
name: catalogue-proof
type: execution
originator: user
size: small
depends-on: 
related-tasks:
status: complete
---

# Task G001: catalogue-proof

## Type: execution

## Description

Catalogue normalization silently drops host ids, variants, and defaults the sizing grammar cannot store, so a real host model can look absent. The gate also cannot prove a config against a catalogue at all today.

Make omissions visible and give `check` an opt-in catalogue cross-check.

## Requirements

- The catalogue records how many host models, variants, and default labels normalization dropped, and the table footer and JSON document expose the counts.
- `--catalog` decoding accepts the optional omitted field so `models --json` keeps round-tripping; `spec_models list` includes it.
- An unstorable host entry is never silently indistinguishable from a missing one: the omission is reported with a coded warning or an explicit count.
- `mf-specs check --catalog <path>` cross-checks the repo config and every spec config against the catalogue; with the flag, an unknown model or effort is an error, and a malformed catalogue is `models.malformed-catalog`.
- Without `--catalog`, `check` stays host-free and keeps today behavior.
- Tests use the fixture catalogue for omission counts, JSON round-trip, a clean check, one unknown model, one unknown effort, and a malformed catalogue.

## Completion

- [ ] The table and JSON report omitted models, variants, and defaults
- [ ] `models --json` still round-trips through `--catalog`
- [ ] `check --catalog` fails on an unknown model and an unknown effort
- [ ] `check` without the flag is unchanged and host-free
- [ ] Catalogue omission and check-catalog tests pass
