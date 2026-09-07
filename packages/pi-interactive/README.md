# @montflow/pi-interactive

Reusable Pi TUI widgets for extensions — a searchable filter-select list
(`filterSelectDialog`: input row over a scrollable list, typing narrows
by subsequence match) and a model picker (`ModelPicker.modelPickerDialog`:
same search UI with the current session model pinned first and a `ctrl+g`
shortcut to keep it) and a working modal (`Working.withWorking`: spinner
that locks input while a closed Effect runs).

```typescript
import { Effect } from 'effect';
import { PiInteractive } from '@montflow/pi-interactive';

export default function (pi) {
  pi.registerCommand('browse', {
    description: 'Browse things',
    handler: (_args, ctx) =>
      Effect.runPromise(
        PiInteractive.filterSelectDialog(ctx.ui, 'Browse things', ['alpha', 'beta']),
      ),
  });
}
```

Every export is an `Effect` — pure helpers (`matchesFilter`,
`filterOptions`, `displayModel`, `currentOption`, `pickerItems`,
`currentBanner`) via `Effect.sync`/`Effect.gen`, dialogs via
`Effect.promise` over `ui.custom`. Return types are inferred, and the
`ui` surface stays an explicit parameter (same convention as
`@montflow/pi-effect`), so callers provide what the widget needs — no
`@montflow/pi-effect` dependency.

```

TUI-only — callers fall back to Pi-native `input`-then-`select` outside
the TUI (see `searchSelectFor`).

## Status

Boilerplate (`0.0.1`, private). Source-only — no build step: Pi loads the
`.ts` files directly, same as `pi/zi`. Run `bun install` from the repo
root for dependencies, then `turbo` `test` / `ts:check` cover this package
like the rest.
```
