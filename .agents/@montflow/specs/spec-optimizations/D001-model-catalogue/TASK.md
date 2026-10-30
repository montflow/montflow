---
id: D001
name: model-catalogue
type: execution
originator: user
size: medium
depends-on: A001
related-tasks:
status: complete
---

# Task D001: model-catalogue

## Type: execution

## Description

Make the harness's model catalogue a mechanical read. The plugin's model seam
gains each entry's effort variants, a pure catalogue module normalizes it, and
`mf-specs models` prints what this harness can actually dispatch. The same
catalogue cross-checks a `sizing.json`, so a generated config cannot point at a
model or an effort the host does not have.

## Requirements

- Extend the model seam in `packages/opencode` so a descriptor carries the
  host's effort variants (`variants?: readonly string[]`). Additive only: no
  existing consumer changes behaviour, and a host entry without variant data is
  reported as unknown, never as an empty list. The server and TUI halves must
  agree on the shape.
- Add a pure catalogue module under `packages/specs/src/modules/catalogue/`:
  normalize (trim, dedupe, sort by provider then model), carry the host's
  default model, and expose one `Catalogue` value that both the command and the
  verifier consume. No I/O in the module. Duplicates collapse to one entry;
  disagreeing non-null variant lists union, and a `null` on any duplicate keeps
  the entry unknown.
- Add `mf-specs models [--provider <id>] [--json] [--catalog <path>]`. Inside
  the host it reads the model port; a bare run outside the host exits non-zero
  with code `models.unavailable`, naming `--catalog` as the fix.
- Register the host tool `spec_models` and the slash form `/specs models`. The
  tool exposes a `list` action returning the catalogue JSON and a `verify`
  action with an optional spec name; the tool, the slash form, the binary, and
  the verifier share one catalogue module and one renderer.
- `--json` prints a stable, date-free document that is also valid `--catalog`
  input, so `mf-specs models --json > catalog.json` round-trips. A variant list
  is `null` when the host does not know it and `[]` when the host knows there
  are none.
- The default table is one line per model: `provider/model`, its variants or
  `variants unknown`, and a marker on the default. `--provider` filters before
  printing and fails with a diagnostic when the provider has no models.
- Add `mf-specs models --verify [--name <spec>]`. It loads the repo config and,
  when a spec is named, the spec config, including every phase override. A
  model absent from the catalogue is `models.unknown-model`; an effort absent
  from a *known* variant list is `models.unknown-effort`. Both are warnings,
  aggregated in one pass and rendered through A002's diagnostic shape with code,
  path, field, expected, actual, fix, and next. Unknown variants skip the effort
  check and never produce a finding. The `spec_models` verify action exposes the
  same check.
- Omitting `--name` verifies the repo config, including the case where no
  config file exists (a clean no-op). A malformed `--catalog` file is
  `models.malformed-catalog` and exits non-zero.
- Wire `models` through the `/specs` slash form and update
  `COMMAND_DESCRIPTION`.
- Tests: a fixture catalogue with known variants, a known-empty variant list,
  unknown variants, duplicate entries, and unsorted input; the JSON round-trip;
  `--provider` hit and miss; missing host context; a malformed catalog;
  `--verify` with one unknown model, one unknown effort, one skipped
  unknown-variant entry, and repo-only scope; and both `spec_models` actions.
  Assert the codes and the `fix` lines, not just that an error occurred.

## Completion

- [ ] `bun run --cwd packages/specs cli models --json --catalog <fixture>` round-trips through `--catalog`
- [ ] A host-free `models` run exits non-zero with `models.unavailable` and a `--catalog` fix
- [ ] `models --verify` reports one unknown model and one unknown effort in one pass
- [ ] `spec_models` `list` and `verify` return the same document and findings as the binary
- [ ] A model with unknown variants produces no effort finding
- [ ] `bun run --cwd packages/specs test`, `lint:check`, `format:check`, and `ts:check` pass
- [ ] `bun run --cwd packages/opencode test`, `lint:check`, `format:check`, and `ts:check` pass
