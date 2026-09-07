# Loading widget

"Loading…" modal for long runs: locks input behind a spinner dialog in a
gray batch container, then hands back the outcome. The spinner replaces
pre-run "Generating…" notifies in the TUI; outside the TUI callers keep
their notifies.

## Belongs here

- The spinner dialog (`dialog`) built on `Loader` via `ui.custom`, shelled
  in a `Batch` container
- The Effect wrapper (`run`) that races nothing — it runs the Effect to an
  `Either`, then unwraps it past the dialog
- The outcome shape (`Outcome`)

## Does not belong here

- What runs inside (agentic generation, persistence) — the consuming
  extension injects that as the wrapped Effect
- Post-run navigation (detail menus, completion messages) — that lives in
  the consuming flows (e.g. `@montflow/pi-skills` interactive app)
- Pi UI primitives (`notify`, `confirm`, `select`, `input`) — those live in
  `@montflow/pi-effect`
