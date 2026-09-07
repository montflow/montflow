# ModelPicker module

Model picker widget for extensions: a searchable list of `provider/id`
models with the current session model pinned first and highlighted, so
plain enter keeps it.

## Belongs here

- Model option shapes and display helpers (`ModelOption`, `displayModel`,
  `currentOption`, `pickerItems`) — structurally compatible with the
  `ModelOption` in `@montflow/pi-skills` flows so callers pass options
  straight through
- The TUI dialog (`modelPickerDialog`, `pickModel`) built on
  `@earendil-works/pi-tui` via `ui.custom`: fixed `Model picker` heading
  with an optional caller `subtitle`, search bar, pinned-current list,
  and a keybinding footer

## Does not belong here

- Resolving options from the Pi context (current, scoped, catalogue) —
  the consuming extension owns that (see `resolveModelOptions` in
  `@montflow/pi-skills`)
- Agentic execution — the consumer runs the agent with the picked label
- Generic filter matching — that lives in `PiInteractive` (`../filter-select/`)
