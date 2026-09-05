# Color struct

Branded ANSI foreground color names: the `Color` brand plus its validation
(`check`, `make`, `makeUnsafe`, `Blueprint`), the nine `LABELS` (`Label`
keys), the `codes` map with the `code` lookup, and one named constructor
per color (`black`, `red`, ...). Construct with `make` for validated input
or the named constructors for known-valid literals.

## Belongs here

- `Color` brand, `Id`, `check`, `make`, `makeUnsafe`, `Blueprint`
- `LABELS` / `Label`, the `Input` union (`Color | Label`), and the `codes` map plus the `code` lookup
- Named constructors (`black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `gray`)

## Does not belong here

- Text styling or ANSI escape wrapping — that is `modules/format`, which
  consumes colors through `code`
- Class-merging or CSS concerns — that is `@montflow/stlx`
