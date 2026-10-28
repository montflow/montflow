## Stage 0: Verification

- [ ] formatting passes (`bun run --cwd packages/telemetry format:check`)
- [ ] linting passes (`bun run --cwd packages/telemetry lint:check`)
- [ ] typecheck passes (`bun run --cwd packages/telemetry ts:check`)
- [ ] tests pass (`bun run --cwd packages/telemetry test`)

## Stage 1: Identity

- [ ] Anthropic, OpenAI, and Google spans show the correct provider/model icon
- [ ] unknown providers fall back to a deterministic monogram
- [ ] common tool spans show the correct tool icon and unknown tools fall back
- [ ] every icon is local; no runtime network request is made

## Stage 2: Hover detail

- [ ] hovering a span shows type, agent, model, cost, tokens, duration, and payload summary
- [ ] a redacted body shows its digest, never raw text
- [ ] keyboard focus shows the same tooltip
- [ ] showing and moving the tooltip does not reflow the trace or drop pan/zoom frames

## Stage 3: Inspector

- [ ] click or keyboard activation opens the detail inspector for that span
- [ ] the inspector preserves redaction and the copy action copies the span payload
- [ ] the inspector works for both live and folded history spans

## Stage 4: Accessibility and assets

- [ ] canvas content has a DOM inspector path and focus order
- [ ] the icon asset budget and licenses are recorded
- [ ] the viewer still writes no NDJSON and the ingest isolation tests pass
