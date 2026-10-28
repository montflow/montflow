# Memory

## Context

User doubts the TUI can render large session traces. Phase A assumed `session.panel`; this task reopens the surface decision and must settle it with measurements.

Candidates: OpenTUI panel, static HTML export, `Bun.serve` browser UI, native webview (`webview-bun` / Electrobun), third-party UI.

## Progress

- 2026-10-28: complete. Spiked the two leading candidates with 20,000
  synthetic spans and deleted the spike code.

  - TUI (OpenTUI 0.5.12, `createTestRenderer`, headless): mounting 20k
    `TextRenderable` rows fails outright (`Failed to create native renderable`;
    5,000 mounts). A windowed list (40 recycled rows over a 20k-high content
    box) mounts in 2.63ms, first frame 1.88ms wall / 7.38ms native, scroll
    0.16ms wall avg (p95 0.20ms, max 2.19ms) and 0.161ms native avg (p95
    0.208ms), peak RSS 87.9MB.
  - Web UI (`Bun.serve` + virtualized list, headless Chromium 144 via CDP):
    60 recycled rows / 69 DOM nodes; first row 23.2ms; 120-step scroll 16.66ms
    avg, p95 16.8ms, max 16.9ms, 0/121 frames over 20ms; 3.0MB JS heap.
    Full 20k-row DOM: first row 140.2ms, 20,009 nodes, scroll 35.19ms avg /
    61.3ms p95 / 95.3ms max, 84/121 frames over 20ms, 5.4MB heap.
  - Supporting numbers: `Bun.serve` start 0.31ms, 46.8MB RSS; windowed HTML
    shell 398B; 20k-span JSON 2.61MB; pre-rendered 20k-row HTML 2.87MB;
    Chromium cold start 0.18s / 208MB RSS; `webview-bun` 458KB unpacked plus
    WebKitGTK 170MB on disk; Electrobun 47KB npm plus its bundled runtime and
    build toolchain.
  - Spike files (`apps/workspace/scratchpad/spike-tui*.ts`, `/tmp/telemetry-spikes/*`)
    are deleted; no production code was written.

## Open Questions

- None. The feasibility questions above are answered by the spikes: OpenTUI
  virtualizes by culling, not by mounting, so a windowed list is mandatory; the
  TUI route works when windowed; WebKitGTK is present on this machine but is a
  170MB system dependency; Electrobun's bundling conflicts with an
  npm-installable plugin that must stay dependency-light.

## Handoff

### Decision

**On-demand web UI**: `/telemetry` starts a dedicated local viewer process that
serves one virtualized page on `127.0.0.1:0` and opens it in the default
browser. The page is the single surface for both the live session tail and the
`telemetry.db` history view.

### Matrix (measured, 20k spans)

| Axis | TUI windowed | Web UI windowed | Static HTML | Native webview | Third-party |
| --- | --- | --- | --- | --- | --- |
| Usable at 20k | yes, 40-row window; direct 20k mount fails | yes, 60-row window | yes, full DOM | yes (web engine) | yes, external |
| First paint | 2.63ms mount + 1.88ms frame | 23.2ms to first row | 140.2ms to first row (full DOM) | not spiked | n/a |
| Scroll frame time | 0.16ms wall avg, 0.20ms p95 | 16.66ms avg, 16.8ms p95, 0 dropped frames | 35.19ms avg, 61.3ms p95, 84 dropped | not spiked | n/a |
| Zoom / timeline | none; would be hand-built | CSS transform + independent panes | limited to export | engine-dependent | strong |
| Search / filter | hand-built input + refilter | native inputs, 20k filter in-page | static only | engine-dependent | built-in |
| Install weight | 0 new (OpenTUI already shipped) | 0 new; 398B shell, 2.61MB data | 2.87MB per session | 458KB npm + 170MB WebKitGTK | standing server |
| Startup | in-process, no new process | 0.31ms server + 0.18s browser cold start | browser open | native app launch | external boot |
| Cross-platform | terminal-native | any browser | any browser | GTK/WebKit, Wayland-coupled | server install |
| Dev cost | highest (timeline, zoom, filter, windowing) | medium | low, but not live | high (native build) | integration only |
| Testable without GUI | yes (OpenTUI test renderer, used here) | yes (HTTP + DOM row-count + CDP perf harness) | yes (string output) | GUI-only | external |
| Live within 1s | yes (in-process tail) | yes (SSE or 500ms poll) | no | yes | yes |

### Rejected surfaces

- **TUI panel**: windowed scrolling is fast, but 20k direct rows cannot mount,
  and there is no horizontal timeline or zoom. Search and filter must be
  hand-built, and the TUI would need its own windowing code on top. Rejected:
  highest development cost for the axes this viewer needs, not because it is
  too slow.
- **Static HTML export**: 2.87MB per session and 35ms average scroll at 20k
  (84/121 frames over budget). Not live, so `/telemetry` could not show a
  running session; rejected for the live view, not for size alone.
- **Native webview**: `webview-bun` is only 458KB but needs WebKitGTK (170MB
  on disk) and a native binding; Electrobun bundles its own runtime and build
  toolchain. Rejected: install weight, Wayland/GTK coupling, and a build step
  incompatible with an npm-installable OpenCode plugin.
- **Third-party UI** (Jaeger, Phoenix): requires a standing external process
  and an export pipeline; violates the "nothing listens before the user asks"
  rule for a per-session viewer. Rejected explicitly.

### Virtualization (how 20k stays usable)

- Fixed 16px rows over a spacer of `spanCount * 16`; exactly
  `visibleRows + 10` recycled row elements, capped at 120 (800px viewport →
  60 rows). One window update per animation frame, driven by `scrollTop`.
- Default collapsed: streaming deltas are never captured; tool input/content
  and compaction text render as their `{ sha256, bytes }` digest; each row shows
  type, agent, model, cost, and token counts. Expanded detail is per-row, on
  click, never for the whole trace.
- Search/filter runs over the 20k in-memory rows and repaints only the window.

### On-demand lifecycle

- Started only by `/telemetry`: spawn a dedicated Bun viewer process, bind
  `Bun.serve` to `127.0.0.1:0` (random loopback port), open
  `http://127.0.0.1:<port>/` through the platform opener, print the URL.
- Stopped by the page's `pagehide` beacon, or after **5 minutes** without a
  heartbeat (page pings every 30s). The child process closes the listener and
  exits; nothing listens before the command and no process survives close.
- `/telemetry` remains the only entry point for both live and history views.

### B002 acceptance test (pass condition)

1. At 20k spans, the served page has **≤ 120 `.row` elements and ≤ 300 total
   DOM nodes** after first paint.
2. **First row visible ≤ 1000ms** after navigation (measured 23.2ms).
3. Over 120 programmatic scroll steps: **p95 rAF interval ≤ 20ms** and
   **≤ 2 frames > 20ms** (measured 16.8ms, 0). Recorded with the headless
   Chromium harness; CI asserts row/node budget and lifecycle, and the perf
   numbers are recorded in this file.
4. **JS heap ≤ 50MB** at 20k spans (measured 3.0MB).
5. An event appended to the live NDJSON file appears in the page **≤ 1000ms**.
6. No listener before `/telemetry`; after close or 5-minute idle, the port is
   closed and the viewer PID is gone **≤ 5s**.
7. Empty or absent store renders an explicit empty state, not a throw;
   a session whose NDJSON has been pruned still renders from `telemetry.db`.
8. The ingest path still imports no SQLite driver and no network API (existing
   isolation test stays green).

The decision stands as measured: if B002 cannot meet items 1–5, stop and send
the finding back here rather than relaxing the numbers.

## Deviations

- Only the two leading candidates (TUI, web UI) got 20k spikes, as the task
  requires. Static HTML was measured through the same full-DOM page (its
  rendering cost is the browser's), and the native webview was judged on install
  weight and build model without a spike because its rendering engine is the
  same class as the web UI.
- `FCP` is not exposed by headless Chromium 144; the recorded first-paint number
  is the `performance.mark('first-row')` after the first window paint.
