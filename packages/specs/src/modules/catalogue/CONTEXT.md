# Catalogue module

The harness model catalogue as one pure value: every dispatchable
`provider/model`, the effort variants the host reports for it, and the host
default. The binary, the `/specs models` slash form, the `spec_models` tool,
and the config verifier all consume this module instead of reading a model
port or a catalog file themselves.

## Belongs here

- Vocabulary: `Catalogue`, `CatalogueModel`, `SourceModel`, `ModelSource`
- Normalization: `normalize` (trim, drop blanks, dedupe, sort by provider then
  model, union known variant lists on duplicates, `null` wins), `filterProvider`
  (keeps only one provider's models, and keeps the default only when it names a
  model still in the filtered document, so a filtered `--json` never points
  outside itself)
- Stable JSON: `CatalogueDocument`, `toDocument`, `toJson`, `decode`. The
  document is date-free and is also valid `--catalog` input.
- Table rendering: `renderTable` (`variants unknown`, `variants none`, and a
  `*` default marker)
- Config cross-check: `ConfigEntry`, `ConfigFinding`, `verify`
  (`models.unknown-model`, `models.unknown-effort`)
- Codes: `CODES`

## Does not belong here

- Reading a model port or a `--catalog` file — the `cli` app and `apps/server`
  own the Effect wiring
- Rendering a finding as an agent-first diagnostic — the `diagnostic` module owns
  `renderDiagnostic`
- Loading or parsing `sizing.json` — `sizing` owns the config contract
- Any I/O, clock, or process state
