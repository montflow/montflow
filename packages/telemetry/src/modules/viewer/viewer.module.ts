// oxlint-disable-next-line montflow/no-node-platform-imports -- the viewer is a surface process: it lists day files and binds a loopback socket only after the user asks for it.
import * as Fs from 'node:fs';
import { Option, Schema } from 'effect';
import type { Line } from '../event/index.js';
import * as Fold from '../fold/index.js';
import * as Tail from '../tail/index.js';

/** Rows painted at once; the page keeps this many recycled elements. */
export const WINDOW_ROWS = 60;

/** Default idle timeout: five minutes without a page heartbeat. */
export const DEFAULT_IDLE_MS = 5 * 60 * 1_000;

/** One viewer instance. */
export interface Viewer {
  readonly url: string;
  readonly port: number;
  readonly done: Promise<void>;
  stop(): Promise<void>;
}

/** Viewer inputs. */
export interface ViewerOptions {
  readonly directory: string;
  readonly sessionID?: string;
  readonly idleMs?: number;
}

const LiveRequest = Schema.Struct({
  sessionID: Schema.String,
  cursors: Schema.optional(Schema.Record(Schema.String, Schema.Number)),
  fromEnd: Schema.optional(Schema.Boolean),
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

const live = (
  directory: string,
  sessionID: string,
  cursors: Record<string, number>,
  fromEnd: boolean,
) => {
  const next: Record<string, number> = {};
  const lines: Line[] = [];
  for (const name of dayFiles(directory)) {
    const path = `${directory.replace(/\/+$/u, '')}/${name}`;
    if (fromEnd) {
      next[name] = Tail.fileSize(path);
      continue;
    }
    const cursor = cursors[name] ?? 0;
    const result = Tail.read(path, cursor);
    next[name] = result.nextOffset;
    for (const line of result.lines) if (line.sessionID === sessionID) lines.push(line);
  }
  return { lines, cursors: next };
};

/** Visible slice of the span list. */
export interface WindowRange {
  readonly start: number;
  readonly end: number;
}

/** Keep `visible + buffer` rows, clamped to the dataset; exported for tests. */
export const windowRange = (
  total: number,
  scrollTop: number,
  rowHeight = 16,
  visible = 50,
  buffer = 10,
): WindowRange => {
  if (total === 0) return { start: 0, end: 0 };
  const first = Math.floor(scrollTop / rowHeight);
  const start = Math.max(0, first - buffer);
  return { start, end: Math.min(total, start + visible + buffer * 2) };
};

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
<script>
const SESSION = ${JSON.stringify(sessionID ?? null)};
const ROW = 16, WINDOW = ${WINDOW_ROWS};
const viewport = document.getElementById('viewport');
const spacer = document.getElementById('spacer');
const sessionsEl = document.getElementById('sessions');
const emptyEl = document.getElementById('empty');
const totalsEl = document.getElementById('totals');
const filterEl = document.getElementById('filter');
const titleEl = document.getElementById('title');
const rows = [];
for (let i = 0; i < WINDOW; i += 1) {
  const el = document.createElement('div');
  el.className = 'row';
  spacer.appendChild(el);
  rows.push(el);
}
let spans = [];
let visible = [];
let active = SESSION;
let start = -1;
const text = (span) => [span.type, span.agent, modelOf(span), span.sessionID].filter(Boolean).join(' ');
const cost = (span) => (span.payload && typeof span.payload.cost === 'number' ? span.payload.cost : 0);
const tokens = (span) => (span.payload && span.payload.tokens ? span.payload.tokens : null);
const modelOf = (span) => typeof span.model === 'string'
  ? span.model
  : span.model
    ? (span.model.providerID || '-') + '/' + (span.model.id || '-')
    : '-';
function summarize() {
  let totalCost = 0, input = 0, output = 0;
  for (const span of visible) {
    totalCost += cost(span);
    const t = tokens(span);
    if (t) { input += t.input || 0; output += t.output || 0; }
  }
  totalsEl.textContent = visible.length + ' spans · $' + totalCost.toFixed(4) + ' · ' + input + ' in / ' + output + ' out';
  emptyEl.hidden = visible.length !== 0;
}
function applyFilter() {
  const query = filterEl.value.trim().toLowerCase();
  visible = query ? spans.filter((span) => span.search.includes(query)) : spans;
  summarize();
  render();
}
function render() {
  spacer.style.height = (visible.length * ROW) + 'px';
  const first = Math.floor(viewport.scrollTop / ROW);
  const top = Math.max(0, first - 5);
  if (top === start && visible.length === 0) return;
  start = top;
  for (let i = 0; i < WINDOW; i += 1) {
    const index = top + i;
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
function searchable(span) {
  return (text(span) + ' ' + JSON.stringify(span.payload || {})).toLowerCase();
}
async function loadSessions() {
  let list = [];
  try { list = await (await fetch('/api/sessions')).json(); } catch {}
  sessionsEl.replaceChildren();
  for (const session of list) {
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = session.title || session.sessionID;
    link.className = session.sessionID === active ? 'active' : '';
    link.onclick = (event) => { event.preventDefault(); void openSession(session.sessionID); };
    sessionsEl.appendChild(link);
  }
  if (active === null && list.length > 0) await openSession(list[0].sessionID);
  if (active !== null && spans.length === 0) await openSession(active);
}
async function openSession(sessionID) {
  active = sessionID;
  titleEl.textContent = sessionID;
  try {
    const loaded = await (await fetch('/api/spans?session=' + encodeURIComponent(sessionID))).json();
    spans = loaded.map((span) => ({ ...span, search: searchable(span) }));
  } catch { spans = []; }
  applyFilter();
}
const cursors = {};
async function poll() {
  if (active === null) return;
  try {
    const response = await fetch('/api/live', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionID: active, cursors }),
    });
    const body = await response.json();
    Object.assign(cursors, body.cursors);
    if (body.lines.length > 0) {
      for (const line of body.lines) spans.push({ ...line, search: searchable(line) });
      applyFilter();
    }
  } catch {}
}
async function seekEnd() {
  try {
    const response = await fetch('/api/live', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionID: active, cursors: {}, fromEnd: true }),
    });
    const body = await response.json();
    Object.assign(cursors, body.cursors);
  } catch {}
}
async function bootstrap() {
  await loadSessions();
  if (spans.length > 0) await seekEnd();
  await poll();
}
viewport.addEventListener('scroll', () => requestAnimationFrame(render), { passive: true });
filterEl.addEventListener('input', applyFilter);
window.addEventListener('pagehide', () => { navigator.sendBeacon('/close', '1'); });
fetch('/heartbeat', { method: 'POST' }).catch(() => {});
setInterval(() => { fetch('/heartbeat', { method: 'POST' }).catch(() => {}); }, 30000);
setInterval(poll, 400);
void bootstrap();
</script></body></html>`;

const json = <T>(value: T): Response => Response.json(value);

/**
 * Fold history, then serve the page and its data endpoints on loopback. Nothing
 * binds until `start` is called; `stop` closes the socket and resolves `done`.
 */
export const start = async (options: ViewerOptions): Promise<Viewer> => {
  const directory = options.directory;
  const database = `${directory.replace(/\/+$/u, '')}/telemetry.db`;
  try {
    await Fold.run({ directory, database });
  } catch {
    // A locked or unwritable database still leaves history empty; the page renders its empty state.
  }
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  let active = options.sessionID;
  let lastHeartbeat = performance.now();
  let stopped = false;
  const { promise: done, resolve: resolveDone } = Promise.withResolvers<void>();

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/')
        return new Response(page(active), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      if (url.pathname === '/api/sessions') return json(await Fold.sessions(database));
      if (url.pathname === '/api/spans') {
        const session = url.searchParams.get('session');
        if (session === null) return json([]);
        return json(await Fold.spans(database, session));
      }
      if (url.pathname === '/api/live' && request.method === 'POST') {
        const body = Option.getOrUndefined(
          Schema.decodeUnknownOption(LiveRequest)(await request.json()),
        );
        if (body === undefined) return json({ lines: [], cursors: {} });
        return json(live(directory, body.sessionID, body.cursors ?? {}, body.fromEnd ?? false));
      }
      if (url.pathname === '/heartbeat') {
        lastHeartbeat = performance.now();
        return json({ ok: true });
      }
      if (url.pathname === '/close') {
        void (async () => {
          await Bun.sleep(25);
          await stop();
        })();
        return json({ ok: true });
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
    if (performance.now() - lastHeartbeat > idleMs) {
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
    done,
    stop,
  };
};
