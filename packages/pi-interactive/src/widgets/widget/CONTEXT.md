# Widget module

Pipeable handle over Pi TUI nodes, mirroring `Format` in `@montflow/format`:
lift with `make` (or start from `container`), compose with `add` / `addAll`,
and unwrap with `compile` at the `ui.custom` boundary.

Handles thread the mutable TUI node (unlike `Format`'s immutable strings):
`add` appends in place and returns a new handle over the same node. Treat
handles as single-use builder chains — never fork one handle into two pipes.

Transforms (`add`, `addAll`) are dual API via `Function.dual`, mirroring
Effect: pipe-friendly data-last (`shell.pipe(Widget.add(child))`) or direct
data-first (`Widget.add(shell, child)`).

## Belongs here

- The `Widget` Pipeable value plus its transforms (`make`, `container`, `add`, `addAll`)
- Consuming helpers (`compile`, `isWidget`)

## Does not belong here

- Styled leaves (`Title`) or themed shells (`Batch`) — those live in their
  own widgets and return handles
- Dialog effects and input handling — the dialog widgets own those
- ANSI formatting itself — that is `@montflow/format`
