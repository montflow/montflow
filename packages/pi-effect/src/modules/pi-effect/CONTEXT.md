# PiEffect module

Effect wrappers around Pi extension primitives (`ctx.ui` dialogs,
`sendUserMessage`, slash-command registration).

## Belongs here

- Lifting Pi callback/promise APIs into `Effect` (`notify`, `confirm`,
  `select`, `input`, `sendUserMessage`)
- Running Effects from Pi handlers with user-visible failure reporting
  (`runAndNotify`, `registerCommand`, `registerCommandEffect`)

## Does not belong here

- Pi business logic (commands, tools, event handlers) — that lives in the
  consuming extension (e.g. `pi/zi`)
- Effect services/layers with their own state — add a new module for those
