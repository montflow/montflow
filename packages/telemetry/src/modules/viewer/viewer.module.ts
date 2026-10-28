import { Option, Schema } from 'effect';
import type { Line } from '../event/index.js';
import * as Fold from '../fold/index.js';
import { catalog } from '../icons/index.js';
import { file } from '../path/index.js';
import { dirname, Fs, fileURLToPath } from '../platform/index.js';
import * as Tail from '../tail/index.js';

/** Default idle timeout: five minutes without a page heartbeat. */
export const DEFAULT_IDLE_MS = 5 * 60 * 1_000;

/** Default grace period after `pagehide`, so a refresh does not kill the viewer. */
export const DEFAULT_CLOSE_DELAY_MS = 4_000;

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

/** The bundled Pixi module path, resolved from the installed dependency. */
export const pixiModule = (): string | undefined => {
  try {
    const manifest = fileURLToPath(import.meta.resolve('pixi.js/package.json'));
    return `${dirname(manifest)}/dist/pixi.min.mjs`;
  } catch {
    return undefined;
  }
};

const LiveRequest = Schema.Struct({
  cursors: Schema.optional(Schema.Record(Schema.String, Schema.Number)),
  fromFold: Schema.optional(Schema.Boolean),
});
const ClientRequest = Schema.Struct({ id: Schema.optional(Schema.String) });
const decodeLiveRequest = Schema.decodeUnknownOption(LiveRequest);
const decodeClientRequest = Schema.decodeUnknownOption(ClientRequest);

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
  cursors: Record<string, number>,
  fingerprints: Map<string, string>,
  bases: Map<string, number>,
) => {
  const next: Record<string, number> = {};
  const lines: Line[] = [];
  const resetSessions = new Set<string>();
  const resetFiles: string[] = [];
  let reset = false;
  for (const name of dayFiles(directory)) {
    const path = file(directory, name);
    const current = Tail.fingerprint(path, bases.get(name) ?? 0);
    const stored = fingerprints.get(name);
    const rewritten = current !== '' && stored !== undefined && stored !== '' && stored !== current;
    if (current !== '') fingerprints.set(name, current);
    const cursor = rewritten ? 0 : Math.max(0, cursors[name] ?? 0);
    const shrunk = Tail.fileSize(path) < cursor;
    if (rewritten || shrunk) {
      reset = true;
      resetFiles.push(name);
    }
    const result = Tail.read(path, shrunk ? 0 : cursor);
    next[name] = result.nextOffset;
    if (rewritten || shrunk) for (const line of result.lines) resetSessions.add(line.sessionID);
    lines.push(...result.lines);
  }
  return { lines, cursors: next, reset, resetSessions: [...resetSessions], resetFiles };
};

/** JSON safe to embed inside a `<script>` element. */
const scriptJson = (value: string | null): string =>
  JSON.stringify(value).replaceAll('<', '\\u003c');

/** The self-contained page: DOM shell plus the Pixi timeline. */
export const page = (sessionID: string | undefined): string => `<!doctype html>
<html><head><meta charset="utf-8" /><title>telemetry</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0f1115; color: #d7dbe0; font: 12px/16px ui-monospace, monospace; }
  #app { display: grid; grid-template-columns: 210px 1fr; height: 100vh; }
  aside { border-right: 1px solid #242a33; overflow: auto; padding: 8px; }
  aside h1 { font-size: 12px; margin: 0 0 8px; color: #8b95a5; font-weight: normal; }
  aside a { display: block; color: #d7dbe0; padding: 4px 6px; text-decoration: none; border-radius: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  aside a.active, aside a:hover { background: #1c2330; }
  main { display: flex; flex-direction: column; min-width: 0; position: relative; }
  header { display: flex; gap: 10px; align-items: center; padding: 8px; border-bottom: 1px solid #242a33; }
  header input { flex: 1; background: #0b0d11; color: inherit; border: 1px solid #2a313c; padding: 4px 6px; font: inherit; }
  header button { background: #1c2330; color: inherit; border: 1px solid #2a313c; padding: 4px 8px; font: inherit; cursor: pointer; }
  header span { color: #8b95a5; white-space: nowrap; }
  #trace { flex: 1; min-height: 0; position: relative; overflow: hidden; }
  #trace canvas { display: block; }
  #tip { position: absolute; z-index: 3; max-width: 360px; padding: 6px 8px; background: #171b23; border: 1px solid #2a313c; border-radius: 4px; pointer-events: none; white-space: pre-wrap; }
  #detail { position: absolute; right: 0; top: 41px; bottom: 0; width: 360px; overflow: auto; padding: 10px; background: #12161d; border-left: 1px solid #242a33; z-index: 2; }
  #detail pre { white-space: pre-wrap; word-break: break-word; font: 11px/1.5 ui-monospace, monospace; }
  #detail button { background: #1c2330; color: inherit; border: 1px solid #2a313c; padding: 3px 8px; font: inherit; cursor: pointer; }
  .empty { padding: 24px; color: #8b95a5; }
</style></head>
<body><div id="app">
  <aside><h1>sessions</h1><div id="sessions"></div></aside>
  <main>
    <header><strong id="title">live</strong><input id="filter" placeholder="filter spans" /><button id="follow">following</button><span id="totals"></span></header>
    <div id="trace" tabindex="0"><div id="tip" hidden></div><div id="empty" class="empty">No telemetry yet. Run a session and reopen /telemetry.</div></div>
    <div id="detail" role="dialog" aria-label="Span detail" tabindex="-1" hidden><button id="close-detail">close</button><button id="copy-detail">copy</button><img id="detail-icon" width="14" height="14" alt="" style="vertical-align:middle;margin-left:8px" /><pre id="detail-body"></pre></div>
  </main>
</div>
<script type="module">
const SESSION = new URLSearchParams(location.search).get('session') ?? ${scriptJson(sessionID ?? null)};
const ICONS = ${JSON.stringify(catalog()).replaceAll('<', '\\u003c')};
const CLIENT_ID = crypto.randomUUID();
const trace = document.getElementById('trace');
const tip = document.getElementById('tip');
const detail = document.getElementById('detail');
const detailBody = document.getElementById('detail-body');
const detailIcon = document.getElementById('detail-icon');
const sessionsEl = document.getElementById('sessions');
const titleEl = document.getElementById('title');
const totalsEl = document.getElementById('totals');
const filterEl = document.getElementById('filter');
const emptyEl = document.getElementById('empty');
const followEl = document.getElementById('follow');
const PIXI = await import('/pixi.mjs');

const LANES = ['session', 'step', 'tool', 'permission', 'compaction'];
const LANE_Y = { session: 40, step: 84, tool: 128, permission: 172, compaction: 216 };
const COLORS = { session: 0x6ea8fe, step: 0x8ce99a, tool: 0xffd43b, permission: 0xff8787, compaction: 0xb197fc };
const GUTTER = 100;
const history = new Map();
const liveBySession = new Map();
const cursors = {};
let active = SESSION;
let spans = [];
let minTs = Infinity;
let maxTs = -Infinity;
let baseScale = 0.05;
let zoom = 1;
let viewStart = 0;
let follow = true;
let foldError = null;
let historyError = null;
let selected = -1;
let seeded = false;
let polling = false;
let drag = null;

const laneOf = (type) => {
  if (type === 'session.created' || type === 'session.idle' || type.startsWith('session.execution') || type === 'session.usage.updated' || type === 'session.inbox.enqueued') return 'session';
  if (type.startsWith('session.step')) return 'step';
  if (type.startsWith('session.tool')) return 'tool';
  if (type.startsWith('permission')) return 'permission';
  if (type.startsWith('session.compaction')) return 'compaction';
  return 'session';
};
const modelOf = (line) => typeof line.model === 'string' ? line.model : line.model ? (line.model.providerID || '-') + '/' + (line.model.id || '-') : '-';
const payloadOf = (line) => line.payload || {};
const costOf = (line) => typeof payloadOf(line).cost === 'number' ? payloadOf(line).cost : 0;
const tokensOf = (line) => payloadOf(line).tokens || null;

const app = new PIXI.Application();
await app.init({ background: '#0f1115', antialias: false, autoDensity: true, resolution: window.devicePixelRatio || 1, resizeTo: trace, preference: 'webgl' });
trace.appendChild(app.canvas);
const container = new PIXI.ParticleContainer({ texture: PIXI.Texture.WHITE, dynamicProperties: { position: true } });
app.stage.addChild(container);
const laneLabels = LANES.map((lane, index) => {
  const label = new PIXI.Text({ text: lane, style: { fill: '#8b95a5', fontFamily: 'monospace', fontSize: 10 } });
  label.position.set(8, LANE_Y[lane] - 5);
  app.stage.addChild(label);
  return label;
});
const axisLabels = Array.from({ length: 5 }, () => {
  const label = new PIXI.Text({ text: '', style: { fill: '#8b95a5', fontFamily: 'monospace', fontSize: 10 } });
  label.position.set(GUTTER, 12);
  app.stage.addChild(label);
  return label;
});
const minimap = new PIXI.Graphics();
app.stage.addChild(minimap);
const iconPool = Array.from({ length: 60 }, () => {
  const label = new PIXI.Text({ text: '', style: { fill: '#d7dbe0', fontFamily: 'monospace', fontSize: 10 } });
  label.visible = false;
  app.stage.addChild(label);
  return label;
});

const width = () => Math.max(320, app.screen.width);
const height = () => Math.max(240, app.screen.height);
const viewWidth = () => (width() - GUTTER - 20) / (baseScale * zoom);
const timeOf = (x) => viewStart + (x - GUTTER) / (baseScale * zoom);
const xOf = (ts) => GUTTER + (ts - viewStart) * baseScale * zoom;
const tailStart = (ts) => Math.max(minTs, ts - viewWidth() * 0.9);
const colorOf = (line) => COLORS[laneOf(line.type)] ?? 0x6ea8fe;
const providerOf = (line) => {
  if (line.model && typeof line.model === 'object') return line.model.providerID;
  if (typeof line.model === 'string') return line.model.split('/')[0];
  return undefined;
};
const toolNameOf = (line) => {
  const payload = payloadOf(line);
  return typeof payload.name === 'string' ? payload.name : typeof payload.tool === 'string' ? payload.tool : undefined;
};
const svgFor = (glyph, color) => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" rx="3" fill="' + color + '"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="10" fill="#0f1115">' + glyph + '</text></svg>');
const iconOf = (line) => {
  if (laneOf(line.type) === 'tool') {
    const key = (toolNameOf(line) || 'unknown').toLowerCase();
    return ICONS.tools[key] ?? ICONS.tools.unknown;
  }
  const provider = providerOf(line);
  const key = (provider || 'unknown').toLowerCase();
  if (ICONS.providers[key] !== undefined) return ICONS.providers[key];
  const glyph = provider === undefined || provider.length === 0 ? '•' : provider.charAt(0).toUpperCase();
  return { ...ICONS.providers.unknown, glyph, svg: svgFor(glyph, '#8b95a5'), label: provider || 'Provider' };
};
const startedAt = new Map();
const durationOf = (line) => {
  const payload = payloadOf(line);
  const key = (line.type.startsWith('session.step') ? 'step:' : line.type.startsWith('session.tool') ? 'tool:' : '') + (payload.assistantMessageID || payload.id || '');
  if (line.type.endsWith('.started') || line.type.endsWith('.called')) { startedAt.set(key, line.ts); return null; }
  const start = startedAt.get(key);
  if (start !== undefined && (line.type.endsWith('.ended') || line.type.endsWith('.failed') || line.type.endsWith('.success'))) { startedAt.delete(key); return line.ts - start; }
  return null;
};
const lowerBound = (ts) => {
  let low = 0;
  let high = spans.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((spans[mid].line.ts || 0) < ts) low = mid + 1;
    else high = mid;
  }
  return low;
};

const makeView = (line) => ({ line, lane: laneOf(line.type), color: colorOf(line), duration: durationOf(line), hidden: false, particle: null });
const addParticle = (view) => {
  view.particle = new PIXI.Particle({
    texture: PIXI.Texture.WHITE,
    x: (view.line.ts || 0) * baseScale,
    y: LANE_Y[view.lane],
    scaleX: 4,
    scaleY: 14,
    color: view.color,
  });
  container.addParticle(view.particle);
};
const clearParticles = () => {
  container.removeParticles();
};
const applyView = () => {
  container.x = GUTTER - viewStart * baseScale * zoom;
  container.scale.x = zoom;
  const start = viewStart;
  const end = viewStart + viewWidth();
  for (let index = 0; index < axisLabels.length; index += 1) {
    const label = axisLabels[index];
    const ts = start + ((end - start) * index) / (axisLabels.length - 1);
    label.text = new Date(ts).toISOString().slice(11, 19);
    label.x = GUTTER + ((width() - GUTTER - 20) * index) / (axisLabels.length - 1);
  }
  const mapY = height() - 18;
  minimap.clear();
  minimap.rect(GUTTER, mapY, width() - GUTTER - 20, 4).fill(0x242a33);
  const span = Math.max(1, maxTs - minTs);
  const left = GUTTER + ((viewStart - minTs) / span) * (width() - GUTTER - 20);
  const w = Math.max(2, (viewWidth() / span) * (width() - GUTTER - 20));
  minimap.rect(left, mapY, w, 4).fill(0x6ea8fe);
  let slot = 0;
  if (zoom >= 0.6) {
    const first = lowerBound(viewStart);
    for (let index = first; index < spans.length && slot < iconPool.length; index += 1) {
      const view = spans[index];
      if (view.hidden) continue;
      const x = xOf(view.line.ts || 0);
      if (x < GUTTER - 2) continue;
      if (x > width() - 16) break;
      const icon = iconOf(view.line);
      const label = iconPool[slot];
      if (label === undefined) break;
      label.text = icon.glyph;
      label.style.fill = icon.color;
      label.x = x + 1;
      label.y = LANE_Y[view.lane] - 2;
      label.visible = true;
      slot += 1;
    }
  }
  for (; slot < iconPool.length; slot += 1) {
    const label = iconPool[slot];
    if (label !== undefined) label.visible = false;
  }
};
const refreshTotals = () => {
  let cost = 0;
  let input = 0;
  let output = 0;
  let visibleCount = 0;
  for (const view of spans) {
    if (view.hidden) continue;
    visibleCount += 1;
    if (view.line.type !== 'session.step.ended') continue;
    cost += costOf(view.line);
    const tokens = tokensOf(view.line);
    if (tokens) { input += tokens.input || 0; output += tokens.output || 0; }
  }
  totalsEl.textContent = visibleCount + ' spans · $' + cost.toFixed(4) + ' · ' + input + ' in / ' + output + ' out';
  emptyEl.hidden = visibleCount !== 0;
  if (visibleCount === 0) {
    const query = filterEl.value.trim();
    emptyEl.textContent = historyError !== null
      ? 'History unavailable: ' + historyError
      : foldError !== null
        ? 'History unavailable: ' + foldError
        : query !== ''
          ? 'No spans match this filter.'
          : 'No telemetry yet. Run a session and reopen /telemetry.';
  }
};
const fit = () => {
  const span = Math.max(1000, maxTs - minTs);
  baseScale = Math.max(0.000001, (width() - GUTTER - 20) / span);
  zoom = 1;
  viewStart = minTs === Infinity ? 0 : minTs;
  applyView();
};
const addLine = (line) => {
  if (line.sessionID !== active) return;
  if (!Number.isFinite(line.ts)) return;
  minTs = Math.min(minTs, line.ts);
  maxTs = Math.max(maxTs, line.ts);
  if (spans.length === 0) fit();
  if (follow && maxTs - minTs > 0) {
    const target = (width() - GUTTER - 20) / (maxTs - minTs);
    if (target < baseScale * 0.66) {
      baseScale = target;
      for (const item of spans) {
        if (item.particle) item.particle.x = (item.line.ts || 0) * baseScale;
      }
    }
  }
  const view = makeView(line);
  const query = filterEl.value.trim().toLowerCase();
  const hay = (line.type + ' ' + (line.agent || '') + ' ' + modelOf(line)).toLowerCase();
  view.hidden = query !== '' && !hay.includes(query);
  spans.push(view);
  addParticle(view);
  if (view.hidden && view.particle) view.particle.y = -100;
  if (follow) viewStart = tailStart(line.ts);
  applyView();
  refreshTotals();
};
const rebuild = () => {
  clearParticles();
  startedAt.clear();
  spans = [];
  minTs = Infinity;
  maxTs = -Infinity;
  for (const line of [...(history.get(active) ?? []), ...(liveBySession.get(active) ?? [])]) {
    if (!Number.isFinite(line.ts)) continue;
    minTs = Math.min(minTs, line.ts);
    maxTs = Math.max(maxTs, line.ts);
  }
  fit();
  const lines = [...(history.get(active) ?? []), ...(liveBySession.get(active) ?? [])];
  for (const line of lines) {
    const view = makeView(line);
    spans.push(view);
    addParticle(view);
  }
  applyView();
  refreshTotals();
  applyFilter();
};
const applyFilter = () => {
  const query = filterEl.value.trim().toLowerCase();
  for (const view of spans) {
    const hay = (view.line.type + ' ' + (view.line.agent || '') + ' ' + modelOf(view.line)).toLowerCase();
    view.hidden = query !== '' && !hay.includes(query);
    if (view.particle) view.particle.y = view.hidden ? -100 : LANE_Y[view.lane];
  }
  refreshTotals();
  applyView();
};

let sessionList = [];
const renderSessions = () => {
  const scroll = sessionsEl.scrollTop;
  sessionsEl.replaceChildren();
  const ids = new Set(sessionList.map((session) => session.sessionID));
  for (const id of liveBySession.keys()) {
    if (!ids.has(id)) { sessionList.push({ sessionID: id, title: null }); ids.add(id); }
  }
  if (active !== null && !ids.has(active)) sessionList.push({ sessionID: active, title: null });
  for (const session of sessionList) {
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = session.title || session.sessionID;
    link.className = session.sessionID === active ? 'active' : '';
    link.onclick = (event) => { event.preventDefault(); void openSession(session.sessionID); };
    sessionsEl.appendChild(link);
  }
  sessionsEl.scrollTop = scroll;
};
const loadSessions = async () => {
  try { sessionList = await (await fetch('/api/sessions')).json(); } catch { sessionList = []; }
  renderSessions();
};
const openSession = async (sessionID) => {
  active = sessionID;
  historyError = null;
  titleEl.textContent = sessionID + (foldError !== null ? ' · history unavailable' : '');
  detail.hidden = true;
  selected = -1;
  if (!history.has(sessionID)) {
    try {
      const rows = await (await fetch('/api/spans?session=' + encodeURIComponent(sessionID))).json();
      history.set(sessionID, rows.map((row) => ({ ...row, type: row.type, ts: row.ts, payload: row.payload || {}, model: row.model })));
      historyError = null;
    } catch {
      history.delete(sessionID);
      historyError = 'history request failed';
      titleEl.textContent = sessionID + ' · history unavailable';
    }
  }
  rebuild();
  renderSessions();
};
const showTip = (view, x, y) => {
  const line = view.line;
  const tokens = tokensOf(line);
  const icon = iconOf(line);
  const body = line.type + '  ' + icon.label + '  ' + (line.agent || '-') + '  ' + modelOf(line) +
    '\\n' + new Date(line.ts).toISOString() +
    (costOf(line) ? '\\ncost $' + costOf(line).toFixed(4) : '') +
    (tokens ? '\\ntokens ' + (tokens.input || 0) + ' in / ' + (tokens.output || 0) + ' out' : '') +
    (view.duration === null ? '' : '\\nduration ' + Math.round(view.duration) + 'ms') +
    '\\npayload keys ' + Object.keys(payloadOf(line)).join(', ');
  tip.replaceChildren();
  const image = document.createElement('img');
  image.src = icon.svg;
  image.width = 12;
  image.height = 12;
  image.alt = icon.label;
  image.style.verticalAlign = 'middle';
  const text = document.createElement('span');
  text.style.whiteSpace = 'pre-wrap';
  text.textContent = ' ' + body;
  tip.append(image, text);
  tip.hidden = false;
  tip.style.left = Math.min(x + 12, trace.clientWidth - 380) + 'px';
  tip.style.top = Math.min(y + 12, trace.clientHeight - 100) + 'px';
};
const hideTip = () => { tip.hidden = true; };
const showDetail = (view) => {
  selected = spans.indexOf(view);
  const icon = iconOf(view.line);
  detailIcon.src = icon.svg;
  detailIcon.alt = icon.label;
  detail.hidden = false;
  detailBody.textContent = JSON.stringify({ ...view.line, duration: view.duration }, null, 2);
  detail.focus();
};
const pick = (x, y) => {
  let best = null;
  for (const view of spans) {
    if (view.hidden) continue;
    const laneY = LANE_Y[view.lane];
    if (Math.abs(y - (laneY + 7)) > 12) continue;
    const barX = xOf(view.line.ts || 0);
    const half = Math.max(4, 4 * zoom);
    if (x < barX - half || x > barX + half) continue;
    if (best === null || Math.abs(x - barX) < Math.abs(x - xOf(best.line.ts || 0))) best = view;
  }
  return best;
};
const heartbeat = () => {
  fetch('/heartbeat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: CLIENT_ID }) }).catch(() => {});
};
const seekFold = async () => {
  try {
    const body = await (await fetch('/api/live', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fromFold: true }) })).json();
    Object.assign(cursors, body.cursors);
  } catch {}
};
const poll = async () => {
  if (!seeded || polling) return;
  polling = true;
  try {
    const response = await fetch('/api/live', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cursors }) });
    if (!response.ok) return;
    const body = await response.json();
    Object.assign(cursors, body.cursors);
    const resetFiles = body.resetFiles ?? [];
    const resetActive = active !== null && (
      (body.resetSessions ?? []).includes(active) ||
      (history.get(active) ?? []).some((row) => resetFiles.includes(row.file))
    );
    if (resetActive && active !== null) {
      const rows = (history.get(active) ?? []).filter((row) => !resetFiles.includes(row.file));
      history.set(active, rows);
      liveBySession.set(active, []);
      rebuild();
    }
    for (const line of body.lines) {
      const buffer = liveBySession.get(line.sessionID) ?? [];
      buffer.push(line);
      liveBySession.set(line.sessionID, buffer);
      if (line.sessionID === active) addLine(line);
    }
    if (body.lines.length > 0) {
      await loadSessions();
      if (active === null && sessionList.length > 0) await openSession(sessionList[0].sessionID);
    }
  } catch {}
  finally { polling = false; }
};
const bootstrap = async () => {
  let status = {};
  try { status = await (await fetch('/api/status')).json(); } catch {}
  foldError = status.foldError || null;
  if (foldError) titleEl.textContent = 'history unavailable: ' + foldError;
  await loadSessions();
  if (active === null && sessionList.length > 0) active = sessionList[0].sessionID;
  if (active !== null) await openSession(active);
  else { fit(); applyView(); }
  await seekFold();
  seeded = true;
  await poll();
};

trace.addEventListener('wheel', (event) => {
  event.preventDefault();
  const rect = trace.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const before = timeOf(x);
  zoom = Math.min(50, Math.max(0.01, zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
  viewStart = before - (x - GUTTER) / (baseScale * zoom);
  follow = false;
  followEl.textContent = 'paused';
  applyView();
}, { passive: false });
trace.addEventListener('pointerdown', (event) => {
  trace.focus();
  drag = { x: event.clientX, start: viewStart };
  trace.setPointerCapture(event.pointerId);
});
trace.addEventListener('pointermove', (event) => {
  const rect = trace.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (drag !== null) {
    viewStart = drag.start - (event.clientX - drag.x) / (baseScale * zoom);
    follow = false;
    followEl.textContent = 'paused';
    applyView();
    return;
  }
  const view = pick(x, y);
  if (view === null) hideTip(); else showTip(view, x, y);
});
trace.addEventListener('pointerup', () => { drag = null; });
trace.addEventListener('pointerleave', () => { drag = null; hideTip(); });
trace.addEventListener('click', (event) => {
  const rect = trace.getBoundingClientRect();
  const view = pick(event.clientX - rect.left, event.clientY - rect.top);
  if (view !== null) showDetail(view);
});
const handleKey = (event) => {
  if (event.key === 'Escape') { tip.hidden = true; detail.hidden = true; trace.focus(); return; }
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
  event.preventDefault();
  if (spans.length === 0) return;
  let next = selected;
  let found = false;
  for (let step = 0; step < spans.length; step += 1) {
    const candidateIndex = Math.max(0, Math.min(spans.length - 1, next + (event.key === 'ArrowRight' ? 1 : -1)));
    if (candidateIndex === next) break;
    next = candidateIndex;
    const candidate = spans[next];
    if (candidate !== undefined && !candidate.hidden) { found = true; break; }
  }
  if (!found) return;
  selected = next;
  const view = spans[selected];
  if (view) {
    showDetail(view);
    viewStart = Math.max(minTs, (view.line.ts || 0) - viewWidth() / 2);
    applyView();
    showTip(view, xOf(view.line.ts || 0), LANE_Y[view.lane] + 7);
  }
};
trace.addEventListener('keydown', handleKey);
detail.addEventListener('keydown', handleKey);
followEl.onclick = () => { follow = true; followEl.textContent = 'following'; viewStart = tailStart(maxTs === -Infinity ? 0 : maxTs); applyView(); };
document.getElementById('close-detail').onclick = () => { detail.hidden = true; trace.focus(); };
document.getElementById('copy-detail').onclick = () => { navigator.clipboard?.writeText(detailBody.textContent || '').catch(() => {}); };
filterEl.addEventListener('input', applyFilter);
window.addEventListener('resize', () => { app.renderer.resize(trace.clientWidth, trace.clientHeight); applyView(); });
window.addEventListener('pagehide', () => { navigator.sendBeacon('/close', JSON.stringify({ id: CLIENT_ID })); });
window.addEventListener('pageshow', heartbeat);
heartbeat();
setInterval(heartbeat, 30000);
setInterval(poll, 400);
setInterval(() => { void loadSessions(); }, 5000);
void bootstrap();
</script></body></html>`;

const forbidden = (): Response => new Response('forbidden', { status: 403 });

/**
 * Fold history, then serve the page and its data endpoints on loopback. Nothing
 * binds until `start` is called; `stop` closes the socket and resolves `done`.
 */
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
  const pixi = pixiModule();
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  const closeDelayMs = options.closeDelayMs ?? DEFAULT_CLOSE_DELAY_MS;
  let lastHeartbeat = performance.now();
  let closeAt: number | undefined;
  let stopped = false;
  const clients = new Map<string, number>();
  const liveSessions = new Set<string>();
  if (options.sessionID !== undefined) liveSessions.add(options.sessionID);
  const fingerprints = new Map<string, string>();
  const bases = new Map<string, number>();
  try {
    const offsets = await Fold.offsets(database);
    for (const name of dayFiles(directory)) {
      const base = offsets[name] ?? 0;
      bases.set(name, base);
      fingerprints.set(name, Tail.fingerprint(file(directory, name), base));
    }
  } catch {
    // Missing history is handled by the empty state.
  }
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
        if (pixi === undefined) {
          return new Response('viewer assets unavailable: pixi.js is not installed', {
            status: 500,
          });
        }
        return new Response(page(options.sessionID), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      if (url.pathname === '/pixi.mjs') {
        if (pixi === undefined) return new Response('pixi.js is not installed', { status: 500 });
        return new Response(Bun.file(pixi), { headers: { 'content-type': 'text/javascript' } });
      }
      if (url.pathname === '/api/status') return Response.json({ foldError });
      if (url.pathname === '/api/sessions') {
        try {
          const stored = await Fold.sessions(database);
          const known = new Set(stored.map((session) => session.sessionID));
          for (const sessionID of liveSessions) {
            if (known.has(sessionID)) continue;
            stored.push({
              sessionID,
              title: null,
              agent: null,
              model: null,
              startedAt: null,
              endedAt: null,
              spanCount: 0,
              costUSD: 0,
              inputTokens: 0,
              outputTokens: 0,
            });
          }
          return Response.json(stored);
        } catch (cause) {
          return Response.json({ error: String(cause) }, { status: 500 });
        }
      }
      if (url.pathname === '/api/spans') {
        const session = url.searchParams.get('session');
        if (session === null) return Response.json([]);
        try {
          return Response.json(await Fold.spans(database, session));
        } catch (cause) {
          return Response.json({ error: String(cause) }, { status: 500 });
        }
      }
      if (url.pathname === '/api/live' && request.method === 'POST') {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ lines: [], cursors: {} }, { status: 400 });
        }
        const decoded = Option.getOrUndefined(decodeLiveRequest(body));
        if (decoded === undefined) {
          return Response.json({ lines: [], cursors: {} }, { status: 400 });
        }
        if (decoded.fromFold === true) {
          try {
            const offsets = await Fold.offsets(database);
            for (const name of dayFiles(directory)) {
              const base = offsets[name] ?? 0;
              bases.set(name, base);
              fingerprints.set(name, Tail.fingerprint(file(directory, name), base));
            }
            return Response.json({ lines: [], cursors: offsets });
          } catch {
            return Response.json({ lines: [], cursors: {} });
          }
        }
        try {
          const result = live(directory, decoded.cursors ?? {}, fingerprints, bases);
          for (const line of result.lines) liveSessions.add(line.sessionID);
          return Response.json(result);
        } catch (cause) {
          return Response.json({ error: String(cause) }, { status: 500 });
        }
      }
      if (url.pathname === '/heartbeat' || url.pathname === '/close') {
        let id = 'default';
        try {
          const parsed = JSON.parse((await request.text()) || '{}');
          const decoded = Option.getOrUndefined(decodeClientRequest(parsed));
          if (decoded?.id !== undefined) id = decoded.id;
        } catch {
          // A beacon without a JSON body still counts as the default client.
        }
        const now = performance.now();
        lastHeartbeat = now;
        if (url.pathname === '/heartbeat') {
          clients.set(id, now);
          closeAt = undefined;
        } else {
          clients.delete(id);
          if (clients.size === 0) closeAt = now + closeDelayMs;
        }
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
    if (
      (clients.size === 0 && closeAt !== undefined && now >= closeAt) ||
      now - lastHeartbeat > idleMs
    ) {
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
