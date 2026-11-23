# Model-fallback app

Wires the host seams — `session.hook("retry")` and the `session.execution.failed`
event — to the pure fallback policy.

## Belongs here

- `activate` — resolve the store, register the retry hook, subscribe to events,
  and watch the store
- Runtime reload: a valid store edit swaps the active configuration, an invalid
  one keeps the last good chain and logs every issue
- The two fallback paths: flip an in-flight retry onto the next model, or
  switch and `resume` after a terminal failure
- Host logging for everything the user cannot see in the timeline

## Does not belong here

- Store shape and precedence — `fallback-store`
- Chain order, trigger classification, note wording — those are modules
- Session bookkeeping — `services/fallback-state`
