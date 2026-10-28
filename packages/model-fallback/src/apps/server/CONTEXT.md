# Model-fallback app

Wires the host seams — `session.hook("retry")` and the `session.execution.failed`
event — to the pure fallback policy.

## Belongs here

- `activate` — read options, register the retry hook, subscribe to events
- The two fallback paths: flip an in-flight retry onto the next model, or
  switch and `resume` after a terminal failure
- Host logging for everything the user cannot see in the timeline

## Does not belong here

- Chain order, trigger classification, note wording — those are modules
- Session bookkeeping — `services/fallback-state`
