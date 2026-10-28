import { Option, Schema } from 'effect';
import type { Line } from '../event/index.js';
import * as Fold from '../fold/index.js';
import { file } from '../path/index.js';
import { Fs } from '../platform/index.js';
import * as Tail from '../tail/index.js';

/** Maximum recycled row elements; the page sizes between 60 and this. */
export const WINDOW_ROWS = 120;

/** Default idle timeout: five minutes without a page heartbeat. */
export const DEFAULT_IDLE_MS = 5 * 60 * 1_000;

/** Default grace period after `pagehide`, so a refresh does not kill the viewer. */
export const DEFAULT_CLOSE_DELAY_MS = 10_000;

/** One viewer instance. */
export interface Viewer {
  readonly url: string;
  readonly port: number;
  readonly foldError: string | null;
  readonly done: Promise<void>;
  stop(): Promise<void>;
}

/** Viewer inputs. */
export interface ViewerOptions {
  readonly directory: string;
  readonly sessionID?: string;
  readonly idleMs?: number;
  readonly closeDelayMs?: number;
}

/** Browser-side window math and totals, shared verbatim with the page and tests. */
export const CLIENT_SCRIPT = `
function windowRange(total, scrollTop, rowHeight, visible, buffer) {
  if (total === 0) return { start: 0, end: 0 };
  const first = Math.floor(scrollTop / rowHeight);
  const start = Math.max(0, first - buffer);
  return { start, end: Math.min(total, start + visible + buffer * 2) };
}
function summaryOf(spans) {
  let cost = 0, input = 0, output = 0;
  for (const span of spans) {
    if (span.type !== 'session.step.ended') continue;
    const payload = span.payload || {};
    if (typeof payload.cost === 'number') cost += payload.cost;
    const tokens = payload.tokens;
    if (tokens) { input += tokens.input || 0; output += tokens.output || 0; }
  }
  return { cost, input, output };
}
`;

const LiveRequest = Schema.Struct({
  cursors: Schema.optional(Schema.Record(Schema.String, Schema.Number)),
  fromFold: Schema.optional(Schema.Boolean),
});

const dayFiles = (directory: string): string[] => {
  try {
    return Fs.readdirSync(directory)
      .filter((name) => name.endsWith('.ndjson'))
      .toSorted();
  } catch {
    return [];
  }
};

const live = (directory: string, cursors: Record<string, number>) => {
  const next: Record<string, number> = {};
  const lines: Line[] = [];
  for (const name of dayFiles(directory)) {
    const path = file(directory, name);
    const result = Tail.read(path, cursors[name] ?? 0);
    next[name] = result.nextOffset;
    lines.push(...result.lines);
  }
  return { lines, cursors: next };
};

/** JSON safe to embed inside a `<script>` element. */
const scriptJson = (value: string | null): string =>
  JSON.stringify(value).replaceAll('<', '\\u003c');

/** The self-contained page. One shell for live and history; the data layer is fetched. */
export const page = (sessionID: string | undefined): string => `<!doctype html>
<html><head><meta charset="utf-8" /><title>telemetry</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0f1115; color: #d7dbe0; font: 12px/16px ui-monospace, monospace; }
  #app { display: grid; grid-template-columns: 240px 1fr; height: 100vh; }
  aside { border-right: 1px solid #242a33; overflow: auto; padding: 8px; }
  aside h1 { font-size: 12px; margin: 0 0 8px; color: #8b95a5; font-weight: normal; }
  aside a { display: block; color: #d7dbe0; padding: 4px 6px; text-decoration: none; border-radius: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  aside a.active, aside a:hover { background: #1c2330; }
  main { display: flex; flex-direction: column; min-width: 0; }
  header { display: flex; gap: 12px; align-items: center; padding: 8px; border-bottom: 1px solid #242a33; }
  header input { flex: 1; background: #0b0d11; color: inherit; border: 1px solid #2a313c; padding: 4px 6px; font: inherit; }
  header span { color: #8b95a5; white-space: nowrap; }
  #viewport { flex: 1; overflow: auto; position: relative; }
  #spacer { position: relative; }
  .row { position: absolute; left: 0; right: 0; height: 16px; padding: 0 8px; white-space: pre; overflow: hidden; text-overflow: ellipsis; }
  .empty { padding: 24px; color: #8b95a5; }
</style></head>
<body><div id="app">
  <aside><h1>sessions</h1><div id="sessions"></div></aside>
  <main>
    <header><strong id="title">live</strong><input id="filter" placeholder="filter spans" /><span id="totals"></span></header>
    <div id="empty" class="empty" hidden>No telemetry yet. Run a session and reopen /telemetry.</div>
    <div id="viewport"><div id="spacer"></div></div>
  </main>
</div>
<script>${CLIENT_SCRIPT}</script>
<script>
const SESSION = ${scriptJson(sessionID ?? null)};
const ROW = 16, MAX_WINDOW = ${WINDOW_ROWS};
const viewport = document.getElementById('viewport');
const spacer = document.getElementById('spacer');
const sessionsEl = document.getElementById('sessions');
const emptyEl = document.getElementById('empty');
const totalsEl = document.getElementById('totals');
const filterEl = document.getElementById('filter');
const titleEl = document.getElementById('title');
const history = new Map();
const liveBySession = new Map();
let active = SESSION;
let spans = [];
let visible = [];
let rows = [];
let scrollStart = -1;
let foldError = null;
const text = (span) => [span.type, span.agent, modelOf(span), span.sessionID].filter(Boolean).join(' ');
const modelOf = (span) => typeof span.model === 'string'
  ? span.model
  : span.model
    ? (span.model.providerID || '-') + '/' + (span.model.id || '-')
    : '-';
const tokens = (span) => (span.payload && span.payload.tokens ? span.payload.tokens : null);
const cost = (span) => (span.payload && typeof span.payload.cost === 'number' ? span.payload.cost : 0);
function searchable(span) {
  return (text(span) + ' ' + JSON.stringify(span.payload || {})).toLowerCase();
}
function merged(sessionID) {
  return [...(history.get(sessionID) ?? []), ...(liveBySession.get(sessionID) ?? [])];
}
function ensureRows() {
  const wanted = Math.min(MAX_WINDOW, Math.max(60, Math.ceil(viewport.clientHeight / ROW) + 10));
  if (rows.length === wanted) return;
  rows = [];
  spacer.replaceChildren();
  for (let i = 0; i < wanted; i += 1) {
    const el = document.createElement('div');
    el.className = 'row';
    spacer.appendChild(el);
    rows.push(el);
  }
  scrollStart = -1;
}
function applyFilter() {
  const query = filterEl.value.trim().toLowerCase();
  visible = query ? spans.filter((span) => span.search.includes(query)) : spans;
  summarize();
  render();
}
function summarize() {
  const total = summaryOf(visible);
  totalsEl.textContent = visible.length + ' spans · $' + total.cost.toFixed(4) + ' · ' + total.input + ' in / ' + total.output + ' out';
  emptyEl.hidden = visible.length !== 0;
  if (visible.length === 0) {
    emptyEl.textContent = foldError
      ? 'History unavailable: ' + foldError
      : spans.length === 0
        ? 'No telemetry yet. Run a session and reopen /telemetry.'
        : 'No spans match this filter.';
  }
}
function render() {
  ensureRows();
  spacer.style.height = (visible.length * ROW) + 'px';
  const { start } = windowRange(visible.length, viewport.scrollTop, ROW, rows.length, 10);
  scrollStart = start;
  for (let i = 0; i < rows.length; i += 1) {
    const index = start + i;
    const span = visible[index];
    const el = rows[i];
    el.style.transform = 'translateY(' + (index * ROW) + 'px)';
    el.textContent = span ? format(span) : '';
  }
}
function format(span) {
  const t = tokens(span);
  const c = cost(span);
  return (span.type + ' ' + (span.agent || '-') + ' ' + modelOf(span) +
    (c ? ' $' + c.toFixed(4) : '') + (t ? ' ' + (t.input || 0) + '/' + (t.output || 0) : '')).slice(0, 200);
}
function activate(sessionID) {
  active = sessionID;
  titleEl.textContent = sessionID;
  spans = merged(sessionID);
  applyFilter();
  for (const link of sessionsEl.querySelectorAll('a')) {
    link.className = link.dataset.session === sessionID ? 'active' : '';
  }
}
async function loadSessions() {
  let list = [];
  try { list = await (await fetch('/api/sessions')).json(); } catch {}
  sessionsEl.replaceChildren();
  for (const session of list) {
    const link = document.createElement('a');
    link.href = '#';
    link.dataset.session = session.sessionID;
    link.textContent = session.title || session.sessionID;
    link.className = session.sessionID === active ? 'active' : '';
    link.onclick = (event) => { event.preventDefault(); void openSession(session.sessionID); };
    sessionsEl.appendChild(link);
  }
  if (active === null && list.length > 0) active = list[0].sessionID;
}
async function openSession(sessionID) {
  if (!history.has(sessionID)) {
    try {
      const loaded = await (await fetch('/api/spans?session=' + encodeURIComponent(sessionID))).json();
      history.set(sessionID, loaded.map((span) => ({ ...span, search: searchable(span) })));
    } catch { history.set(sessionID, []); }
  }
  activate(sessionID);
}
const cursors = {};
async function seekFold() {
  try {
    const response = await fetch('/api/live', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fromFold: true }),
    });
    const body = await response.json();
    Object.assign(cursors, body.cursors);
  } catch {}
}
async function poll() {
  try {
    const response = await fetch('/api/live', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cursors }),
    });
    if (!response.ok) return;
    const body = await response.json();
    Object.assign(cursors, body.cursors);
    let touched = false;
    for (const line of body.lines) {
      const entry = { ...line, search: searchable(line) };
      const buffer = liveBySession.get(line.sessionID) ?? [];
      buffer.push(entry);
      liveBySession.set(line.sessionID, buffer);
      if (line.sessionID === active) touched = true;
    }
    if (touched) {
      spans = merged(active);
      applyFilter();
    }
  } catch {}
}
async function bootstrap() {
  try {
    const status = await (await fetch('/api/status')).json();
    foldError = status.foldError || null;
  } catch {}
  await loadSessions();
  if (active !== null) await openSession(active);
  else applyFilter();
  await seekFold();
  await poll();
}
viewport.addEventListener('scroll', () => requestAnimationFrame(render), { passive: true });
filterEl.addEventListener('input', applyFilter);
window.addEventListener('resize', () => requestAnimationFrame(render), { passive: true });
window.addEventListener('pagehide', () => { navigator.sendBeacon('/close', '1'); });
window.addEventListener('pageshow', () => { fetch('/heartbeat', { method: 'POST' }).catch(() => {}); });
fetch('/heartbeat', { method: 'POST' }).catch(() => {});
setInterval(() => { fetch('/heartbeat', { method: 'POST' }).catch(() => {}); }, 30000);
setInterval(poll, 400);
setInterval(() => { void loadSessions(); }, 5000);
void bootstrap();
</script></body></html>`;

/**
 * Fold history, then serve the page and its data endpoints on loopback. Nothing
 * binds until `start` is called; `stop` closes the socket and resolves `done`.
 * A pagehide schedules a close after a grace period so a refresh can cancel it
 * with a heartbeat, while a closed tab still exits.
 */
const forbidden = (): Response => new Response('forbidden', { status: 403 });

export const start = async (options: ViewerOptions): Promise<Viewer> => {
  const directory = options.directory;
  const database = file(directory, 'telemetry.db');
  let foldError: string | null = null;
  try {
    await Fold.run({ directory, database });
  } catch (cause) {
    foldError = String(cause);
    console.error(`viewer: history fold failed: ${foldError}`);
  }
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  const closeDelayMs = options.closeDelayMs ?? DEFAULT_CLOSE_DELAY_MS;
  let lastHeartbeat = performance.now();
  let closeAt: number | undefined;
  let stopped = false;
  const { promise: done, resolve: resolveDone } = Promise.withResolvers<void>();

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const allowed = `127.0.0.1:${server.port}`;
      const host = request.headers.get('host');
      if (host !== null && host !== allowed) return forbidden();
      const origin = request.headers.get('origin');
      if (origin !== null && origin !== `http://${allowed}`) return forbidden();

      const url = new URL(request.url);
      if (url.pathname === '/') {
        return new Response(page(options.sessionID), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      if (url.pathname === '/api/status') return Response.json({ foldError });
      if (url.pathname === '/api/sessions') {
        try {
          return Response.json(await Fold.sessions(database));
        } catch (cause) {
          return Response.json({ error: String(cause) }, { status: 500 });
        }
      }
      if (url.pathname === '/api/spans') {
        const session = url.searchParams.get('session');
        if (session === null) return Response.json([]);
        return Response.json(await Fold.spans(database, session));
      }
      if (url.pathname === '/api/live' && request.method === 'POST') {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ lines: [], cursors: {} }, { status: 400 });
        }
        const decoded = Option.getOrUndefined(Schema.decodeUnknownOption(LiveRequest)(body));
        if (decoded === undefined) {
          return Response.json({ lines: [], cursors: {} }, { status: 400 });
        }
        if (decoded.fromFold === true) {
          return Response.json({ lines: [], cursors: await Fold.offsets(database) });
        }
        return Response.json(live(directory, decoded.cursors ?? {}));
      }
      if (url.pathname === '/heartbeat') {
        lastHeartbeat = performance.now();
        closeAt = undefined;
        return Response.json({ ok: true });
      }
      if (url.pathname === '/close') {
        closeAt = performance.now() + closeDelayMs;
        return Response.json({ ok: true });
      }
      return new Response('not found', { status: 404 });
    },
  });

  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    await server.stop(true);
    resolveDone();
  };

  const monitor = async (): Promise<void> => {
    await Bun.sleep(500);
    if (stopped) return;
    const now = performance.now();
    if ((closeAt !== undefined && now >= closeAt) || now - lastHeartbeat > idleMs) {
      await stop();
      return;
    }
    await monitor();
  };
  void monitor();

  const port = server.port ?? 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    foldError,
    done,
    stop,
  };
};
