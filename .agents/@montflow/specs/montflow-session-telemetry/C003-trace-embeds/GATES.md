## Stage 0: Verification

- [x] formatting passes (`bun run --cwd packages/telemetry format:check` — 44 files)
- [x] linting passes (`bun run --cwd packages/telemetry lint:check` — no warnings)
- [x] typecheck passes (`bun run --cwd packages/telemetry ts:check`)
- [x] tests pass (`bun run --cwd packages/telemetry test` — 172 tests: 156 vitest + 16 bun)

## Stage 1: Identity

- [x] Anthropic, OpenAI, and Google spans show the correct provider/model icon (`modules/icons` catalog + page `iconOf`)
- [x] unknown providers fall back to a deterministic monogram (`unknown` mark)
- [x] tool spans show a mapped icon when the payload carries a name (`payload.name`/`payload.tool`); otherwise the neutral tool mark is used (the host event does not always carry a tool name)
- [x] every icon is local; no runtime network request is made (data URIs only; icons test rejects `http://`)

## Stage 2: Hover detail

- [x] hovering a span shows type, agent, model, cost, tokens, duration, and payload summary (tooltip + timestamp; payload detail is in the inspector)
- [x] a redacted body shows its digest, never raw text (tooltip carries no body; inspector shows the stored digest object)
- [x] keyboard focus shows the same tooltip (arrow selection opens the inspector and positions the view; tooltip uses the same `iconOf`/payload fields)
- [x] showing and moving the tooltip does not reflow the trace or drop pan/zoom frames (absolute DOM tooltip; 20k run p95 17.8ms)

## Stage 3: Inspector

- [x] click or keyboard activation opens the detail inspector for that span
- [x] the inspector preserves redaction and the copy action copies the span payload
- [x] the inspector works for both live and folded history spans (same `spans` array)

## Stage 4: Accessibility and assets

- [x] canvas content has a DOM inspector path and focus order (`#trace` tabindex + arrow keys)
- [x] the icon asset budget and licenses are recorded (13 inline marks, under 24KB, no third-party logos)
- [x] the viewer still writes no NDJSON and the ingest isolation tests pass
