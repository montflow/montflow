# Interaction module

Host-neutral dialog ports and model-picker logic for the `/mf-prompts-tui`
menu. The `/mf-*` flows stay structurally identical across plugins; this
module is the non-TUI fallback plus the option plumbing both paths share.

## Belongs here

- `CANCELLED` sentinel, `InteractiveUi` port, the TUI `ModelPickerFn`
  alias
- `tokenize` (whitespace split keeping `"quoted spans"` together)
- `ModelRef` / `ModelCatalog` / `ModelSource` context slices
- `modelOptions`, `resolveModelOptions`, `matchesFilter`
- `PICK_ANOTHER`, `pickModel`, `pickAgenticModel`

## Rules

- No `@opencode/*` import: the host reaches these flows through
  `@montflow/opencode`'s `InteractionPort`, and the ports here are the
  structural minimum those flows need.
- The TUI widget itself is the host's job; this module carries only the
  fallback.

## Does not belong here

- Resource flows (browse/detail/create/modify/delete) — `../../apps/interactive/`
- Prompt verification and rendering — `../prompts/`, `../prompt-execute/`
