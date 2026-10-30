# Diagnostic module

The one agent-first block every coded failure prints as: `code`, `path`,
`field`, `problem`, and the optional `expected`, `actual`, `fix`, then `next`.
The detail rows `cause`, `layers`, and `stack` print only under `verbose`, so
`--verbose` is the single switch for them on every surface. Pure text — it holds
no severity policy and no failure class of its own.

## Belongs here

- The block shape: `DiagnosticBlock` (a `warning` marks the `code` row `!`)
- The renderer: `renderDiagnostic` / `renderDiagnostics`, and `causeMessage`
  for a preserved cause's own line
- Canonical field order, the label column width, and the `verbose` rule that
  gates every detail row

## Does not belong here

- Building a diagnostic from a failure — `apps/cli` maps `Issue`, `SizingError`,
  `StoreError`, and `PromptError` onto this shape
- What a warning costs — `apps/cli` decides that via `--strict`
- Any I/O, clock, or process state

## Consumers

- `apps/cli` (`renderDiagnostic`, re-exported for the library surface)
- `modules/prompt` for the skill advisories appended to a rendered prompt
