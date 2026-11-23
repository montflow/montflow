# Model-chain module

The ordered list of models a session may fall back to, and the pure rules for
walking it.

## Belongs here

- `parse` — `provider/model[#variant]` strings to model references, repeats
  collapsed
- `key` / `label` — stable identity and display form of a reference
- `next` — first untried entry after the current model, never wrapping

## Does not belong here

- Deciding _when_ to fall back — `fallback-trigger`
- Reading options or building notices — `fallback-config`, `fallback-notice`
- Calling the host — `apps/server`
