# Model-fallback TUI app

The `/mf-fallback` contribution: a slash command that shows the current chain,
picks a new one from the live catalog, or removes it — through host dialogs.

## Belongs here

- The keymap command and its dialog flow (`select`, `confirm`, `alert`)
- The summary modal rendered through `ports.view`
- Mapping flow failures to a host alert

## Does not belong here

- The operations themselves — this face calls the CLI engines, so the dialog and
  the binary cannot disagree
- Store shape and precedence — `fallback-store`
- Ranking and catalog reads — `model-catalog`
