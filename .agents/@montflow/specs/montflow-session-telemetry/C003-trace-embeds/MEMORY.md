# Memory

## Context

C002 lands the canvas timeline and exposes a per-span icon slot plus a
pointer/keyboard hit-test. This task fills those slots with identity and
detail, using only local assets.

OpenCode events already carry `model: { providerID, id, variant? }` and tool
names in payloads. Bodies are stored as `{ redacted, sha256, bytes }` by
default, so tooltips and the inspector must show the digest, not the raw text.

## Progress

- pending

## Open Questions

- Sprite atlas versus inline SVG: the atlas is one texture and one draw path,
  inline SVG is easier to theme. Decide with the measured asset budget.
- How many provider marks are legally safe to redistribute, and which need a
  neutral monogram instead?

## Handoff

- Uses the C002 icon slot and hit-test API; no renderer rewrite.

## Deviations

- None.
