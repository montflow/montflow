# Memory

## Context

C002 lands the canvas timeline and exposes a per-span hit-test. This task fills
the surface with identity and detail, using only local assets.

OpenCode events carry `model: { providerID, id, variant? }` and tool names only
when the payload includes them; bodies are stored as `{ redacted, sha256,
bytes }` by default.

## Progress

- 2026-10-28: complete. Provider and tool marks are local inline SVG data URIs
  in `modules/icons`; the page embeds the catalog and uses the same glyph for
  canvas icons, hover images, and the detail inspector.
  - Provider marks: Anthropic, OpenAI, Google, OpenCode, neutral fallback.
  - Tool marks: bash, read, write, edit, grep, glob, task, webfetch, fallback.
  - Canvas: a 60-slot pooled `Text` icon layer paints only the visible first
    spans at zoom ≥ 0.6; the tooltip shows the same icon as an `<img>`.
  - Inspector: click or `ArrowLeft`/`ArrowRight` opens the panel with the icon
    and the stored span JSON; copy is wired.
  - Asset budget: 13 marks, all inline vector, total `svg` bytes under 24KB;
    no network origin and no third-party logo files.
- 20k run after C003: first paint 599.3ms, pan p95 18.6ms / max 23.1ms, live
  append 213ms, heap 14.3MB, no page errors.
- Tests: 164 total (148 vitest + 16 bun); mapping/fallback/local-asset budget
  covered in `modules/icons/tests/icons.test.ts`; page assertions cover the
  icon layer and inspector.

## Open Questions

- Tool names are not present on every `session.tool.*` event; the mapping uses
  `payload.name`/`payload.tool` and falls back to the neutral tool mark. If a
  host field carries the name consistently, add it to the extractor.
- Provider marks are letter marks, not official logos, to avoid redistributing
  trademarks. Revisit only with a licensed asset set.

## Handoff

- C099 reviews the icon/redaction path, the tooltip/inspector accessibility,
  and the local-only asset rule.

## Deviations

- Icons are glyph/letter marks rather than brand logos. This is deliberate:
  official marks are trademarks and were not bundled.
- The canvas icon layer is a small pooled `Text` layer, not a sprite atlas; at
  ≤60 visible icons it is cheaper than generating textures for 20k spans.
