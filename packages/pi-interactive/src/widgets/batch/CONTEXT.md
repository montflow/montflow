# Batch widget

Padded container with a tinted background for TUI dialogs: wraps children
in a `Box` that reads as one gray block by default (selection gray,
2 spaces of side padding, 1 line top and bottom). Returns a `Widget` handle
and accepts `Widget` children — compose further with `Widget.add` and finish
with `Widget.compile` at the `ui.custom` boundary.

## Belongs here

- The styled container (`box`) and its knobs (`Style`, `Theme`) —
  everything optional, so callers get the gray default with no args
- Nothing else: no dialogs, no input handling, no business logic

## Does not belong here

- What goes inside — the consuming dialog owns its children (e.g. the
  `Loading` spinner wraps its `Loader` in a batch)
- Pi UI primitives (`notify`, `confirm`, `select`, `input`) — those live in
  `@montflow/pi-effect`
