# Menu module

Single-choice menu dialog: heading, optional info panel, then options.
The info panel (`Batch.box`) sits below the heading and above the
options — session context (dependency status, current model, cwd) that
is display-only, never a menu slot.

## Belongs here

- The menu dialog (`menuDialog`) built on `@earendil-works/pi-tui`
  via `ui.custom`: title, info panel, `SelectList`, hint
- Display tuning (`MenuDisplay`)

## Does not belong here

- Menu content (titles, options, info lines) — the consuming extension
  owns that (it knows the session)
- Pi UI primitives (`select`) — the non-TUI fallback stays on those
- The panel painter itself — that lives in `Batch` (`../batch/`)
