# Dialogs module

Shared dialog ports and arg-parsing helpers for `/mf-*` interactive
commands. Extracted from the copy-pasted `pi-prompts` / `pi-skills` /
`pi-profiles` interactive apps so the three stay structurally identical.

## Belongs here

- `CANCELLED` sentinel, `InteractiveUi` / `FilterUi` ports, TUI port
  aliases (`ModelPickerFn`, `LoadingFn`, `MenuFn`)
- `tokenize` (whitespace split keeping `"quoted spans"` together)

## Does not belong here

- Model-picker logic — `../model-options/`
- TUI widgets themselves — `../../widgets/`
- Resource flows (browse/detail/create/modify/delete) — consuming apps
