---
id: C003
name: trace-embeds
type: execution
originator: user
depends-on: C002
related-tasks: C002
status: pending
---

# Task C003: trace-embeds

## Type: execution

## Description

Make the trace self-describing: provider/model and tool identity on each span,
hover tooltips, and a DOM detail inspector. This is the rich-embed layer on top
of the C002 canvas; it must not turn the renderer into a network client.

## Requirements

- Local provider/model icons for the providers that appear in OpenCode events
  (at least Anthropic, OpenAI, Google, and a neutral fallback), resolved from
  the event's `model.providerID`; unknown providers get a deterministic
  monogram, never a network fetch.
- Local tool icons for the common OpenCode tools (bash, read, write, edit,
  grep, glob, task, webfetch) with a neutral fallback; resolved from the tool
  name in the span payload.
- Hover tooltips show type, agent, model, cost, tokens, duration, and a payload
  summary. Redacted bodies stay digests; raw text never appears in a tooltip.
  Tooltips are anchored to the span, do not resize the layout, and have a
  keyboard-focused equivalent.
- Click or keyboard activation opens a DOM detail inspector with the full span
  payload (redaction preserved) and a copy action. The inspector is the
  accessible surface for canvas content.
- Icons ship as local assets (sprite atlas or inline SVG) with a stated size
  budget and license note; no runtime download and no new network origin.
- Tests cover provider/tool mapping and fallbacks, tooltip content and
  redaction, inspector open/close and copy, and keyboard focus. Rendering
  tests use the C002 hit-test seam without a real display.

## Completion

- [ ] Provider/model and tool icons render on spans with deterministic fallbacks.
- [ ] Hover and keyboard focus show a tooltip with the required fields and no raw redacted body.
- [ ] The detail inspector opens from click and keyboard and copies the span payload.
- [ ] Icons are local, within the recorded size budget, and licensed in the asset note.
- [ ] `bun run --cwd packages/telemetry test ts:check lint:check format:check` passes.
