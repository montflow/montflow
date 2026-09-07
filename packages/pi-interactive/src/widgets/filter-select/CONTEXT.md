# Filter-select widget (`PiInteractive`)

Reusable Pi TUI widgets for extensions: a searchable filter-select list
(input row over a scrollable list). Model picking lives next door in
`ModelPicker` (`../model-picker/`).

## Belongs here

- TUI-only widgets built on `@earendil-works/pi-tui` via `ui.custom`
  (`filterSelectDialog`, `searchSelectFor`)
- Pure filter helpers shared by widgets and callers (`matchesFilter`,
  `filterOptions`)

## Does not belong here

- Pi UI primitives (`notify`, `confirm`, `select`, `input`) — those live in
  `@montflow/pi-effect`
- Pi business logic (commands, tools, event handlers) — that lives in the
  consuming extension (e.g. `pi/zi`, `@montflow/pi-skills` flows)
- Persistence or agentic execution — the consuming extension injects those
