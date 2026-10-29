import { Option, Schema } from 'effect';
import type { Line } from '../event/index.js';
import * as Fold from '../fold/index.js';
import { catalog } from '../icons/index.js';
import { file } from '../path/index.js';
import { Fs } from '../platform/index.js';
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
  const lines: Array<Line & { readonly file: string }> = [];
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
    for (const line of result.lines) lines.push({ ...line, file: name });
  }
  return { lines, cursors: next, reset, resetSessions: [...resetSessions], resetFiles };
};

/** JSON safe to embed inside a `<script>` element. */
const scriptJson = (value: string | null): string =>
  JSON.stringify(value).replaceAll('<', '\\u003c');

/** The self-contained page: DOM shell plus the virtualized trace waterfall. */
export const page = (sessionID: string | undefined): string => String.raw`<!doctype html>
<html><head><meta charset="utf-8" /><title>telemetry</title>
<style>
  :root { color-scheme: dark; --label-w: 320px; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0f1115; color: #d7dbe0; font: 12px/16px ui-monospace, monospace; }
  html, body { overflow: hidden; }
  #app { display: grid; grid-template-columns: 210px 1fr; height: 100vh; min-width: 0; overflow: hidden; }
  aside { border-right: 1px solid #242a33; overflow: auto; padding: 8px; }
  aside h1 { font-size: 12px; margin: 0 0 8px; color: #8b95a5; font-weight: normal; }
  aside a { display: block; color: #d7dbe0; padding: 4px 6px; text-decoration: none; border-radius: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  aside a.active, aside a:hover { background: #1c2330; }
  main { display: flex; flex-direction: column; min-width: 0; position: relative; overflow: hidden; }
  header { display: flex; gap: 8px; align-items: center; padding: 8px; border-bottom: 1px solid #242a33; overflow: hidden; }
  header strong { min-width: 0; max-width: 34%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  header input { flex: 1 1 140px; min-width: 110px; background: #0b0d11; color: inherit; border: 1px solid #2a313c; padding: 4px 6px; font: inherit; }
  header button { background: #1c2330; color: inherit; border: 1px solid #2a313c; padding: 4px 8px; font: inherit; cursor: pointer; }
  header button:hover { border-color: #3b4656; }
  header span { flex: 0 1 auto; min-width: 0; color: #8b95a5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #trace { flex: 1; min-height: 0; display: flex; flex-direction: column; position: relative; outline: none; overflow: hidden; }
  #axis { height: 24px; flex: none; position: relative; border-bottom: 1px solid #1b2028; }
  #axis .tick { position: absolute; top: 5px; font-size: 10px; color: #8b95a5; transform: translateX(-50%); white-space: nowrap; }
  #root { height: 32px; flex: none; display: flex; align-items: center; border-bottom: 1px solid #242a33; background: #11151c; }
  #rows-viewport { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; position: relative; }
  #rows { position: relative; min-height: 100%; }
  .row { position: absolute; left: 0; right: 0; height: 30px; display: flex; align-items: center; cursor: pointer; border-bottom: 1px solid #171c24; }
  .row:hover, .row.selected { background: #171d27; }
  .row-label { width: var(--label-w); flex: none; display: flex; align-items: center; gap: 6px; padding-right: 8px; overflow: hidden; white-space: nowrap; }
  .row-label img { width: 14px; height: 14px; flex: none; }
  .row-label .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .row-label .guide { width: 0; align-self: stretch; flex: none; background-image: repeating-linear-gradient(to right, #242a33 0 1px, transparent 1px 14px); }
  .row-label .accent { width: 3px; align-self: stretch; margin: 4px 4px 4px 0; border-radius: 1px; flex: none; }
  .row-label .svc { flex: none; color: #6f7b8c; font-size: 11px; }
  .row-label .toggle { width: 12px; flex: none; color: #8b95a5; text-align: center; }
  .bar { color: #0f1115; font-size: 10px; line-height: 14px; overflow: hidden; white-space: nowrap; padding-left: 4px; }
  .row-label .meta { margin-left: auto; color: #6f7b8c; flex: none; font-size: 11px; }
  .row-track { position: relative; flex: 1; height: 100%; }
  .bar { position: absolute; top: 8px; height: 14px; min-width: 2px; border-radius: 3px; opacity: 0.92; }
  .bar.point { top: 11px; height: 8px; width: 8px; min-width: 8px; border-radius: 1px; transform: translateX(-4px) rotate(45deg); }
  #root .row-label { padding-left: 8px; }
  #root .bar { top: 9px; height: 14px; }
  #empty[hidden] { display: none; }
  #empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #8b95a5; pointer-events: none; }
  #overview { height: 22px; flex: none; margin: 4px 8px 6px; background: #0b0d11; position: relative; cursor: pointer; border: 1px solid #1b2028; }
  #overview #window { position: absolute; top: 0; bottom: 0; background: #1b2c47; border-left: 1px solid #6ea8fe; border-right: 1px solid #6ea8fe; }
  #tip { position: absolute; z-index: 4; max-width: 380px; padding: 6px 8px; background: #171b23; border: 1px solid #2a313c; border-radius: 4px; pointer-events: none; white-space: pre-wrap; }
  #detail { position: absolute; right: 0; top: 41px; bottom: 0; width: 380px; overflow: auto; padding: 10px; background: #12161d; border-left: 1px solid #242a33; z-index: 3; }
  #detail pre { white-space: pre-wrap; word-break: break-word; font: 11px/1.5 ui-monospace, monospace; }
  #detail button { background: #1c2330; color: inherit; border: 1px solid #2a313c; padding: 3px 8px; font: inherit; cursor: pointer; }
  @media (max-width: 760px) { :root { --label-w: 220px; } header strong { display: none; } }
</style></head>
<body><div id="app">
  <aside><h1>sessions</h1><div id="sessions"></div></aside>
  <main>
    <header><strong id="title">live</strong><input id="filter" placeholder="filter spans" /><button id="follow">following</button><button id="collapse-one" title="Collapse one level">-1</button><button id="collapse-all" title="Collapse all">-all</button><button id="expand-all" title="Expand all">+all</button><button id="zoom-out">−</button><button id="zoom-in">+</button><button id="fit">fit</button><span id="totals"></span></header>
    <div id="trace" tabindex="0">
      <div id="axis"></div>
      <div id="root"><div id="root-label" class="row-label"></div><div id="root-track" class="row-track"><div id="root-bar" class="bar"></div></div></div>
      <div id="rows-viewport"><div id="rows"></div><div id="empty" class="empty">No telemetry yet. Run a session and reopen /mf-telemetry.</div></div>
      <div id="tip" hidden></div>
    </div>
    <div id="overview"><div id="window"></div></div>
    <div id="detail" role="dialog" aria-label="Span detail" tabindex="-1" hidden><button id="close-detail">close</button><button id="copy-detail">copy</button><img id="detail-icon" width="14" height="14" alt="" style="vertical-align:middle;margin-left:8px" /><pre id="detail-body"></pre></div>
  </main>
</div>
<script type="module">
const SESSION = new URLSearchParams(location.search).get('session') ?? ${scriptJson(sessionID ?? null)};
const ICONS = ${JSON.stringify(catalog()).replaceAll('<', '\\u003c')};
const CLIENT_ID = crypto.randomUUID();
const trace = document.getElementById('trace');
const axis = document.getElementById('axis');
const rowsViewport = document.getElementById('rows-viewport');
const rowsEl = document.getElementById('rows');
const rootLabel = document.getElementById('root-label');
const rootBar = document.getElementById('root-bar');
const overview = document.getElementById('overview');
const overviewWindow = document.getElementById('window');
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

const ROW_H = 30;
const COLORS = { execution: '#6ea8fe', step: '#8ce99a', tool: '#ffd43b', compaction: '#b197fc', prompt: '#adb5bd', permission: '#ff8787', other: '#8b95a5' };
const history = new Map();
const liveBySession = new Map();
const cursors = {};
let sessionList = [];
let active = SESSION;
let rows = [];
let viewRows = [];
let root = { start: 0, end: 0, line: null };
let lineCount = 0;
let minTs = 0;
let maxTs = 0;
let baseScale = 0.05;
let zoom = 1;
let viewStart = 0;
let follow = true;
let sessionActive = false;
let foldError = null;
let historyError = null;
let selected = null;
const collapsed = new Set();
let polling = false;
let seeded = false;
let suppressClick = false;
let drag = null;
let frame = 0;

const modelOf = (line) => typeof line.model === 'string' ? line.model : line.model ? (line.model.providerID || '-') + '/' + (line.model.id || '-') : '-';
const payloadOf = (line) => line.payload || {};
const costOf = (line) => typeof payloadOf(line).cost === 'number' ? payloadOf(line).cost : 0;
const tokensOf = (line) => payloadOf(line).tokens || null;
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
const iconOf = (line, kind) => {
  if (kind === 'tool') {
    const key = (toolNameOf(line) || 'unknown').toLowerCase();
    return ICONS.tools[key] ?? ICONS.tools.unknown;
  }
  const provider = providerOf(line);
  const key = (provider || 'unknown').toLowerCase();
  if (ICONS.providers[key] !== undefined) return ICONS.providers[key];
  const glyph = provider === undefined || provider.length === 0 ? '•' : provider.charAt(0).toUpperCase();
  return { ...ICONS.providers.unknown, glyph, svg: svgFor(glyph, '#8b95a5'), label: provider || 'Provider' };
};
const shortID = (value) => typeof value === 'string' && value.length > 6 ? value.slice(-6) : value || '';
const fmtDuration = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  if (ms < 1000) return Math.round(ms) + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return minutes + 'm' + (seconds ? seconds + 's' : '');
};
const clockText = (ts) => {
  const text = new Date(ts).toISOString().slice(11, 23);
  return viewWidth() < 10000 ? text : text.slice(0, 8);
};
const labelWidth = () => rootLabel.getBoundingClientRect().width || 320;
const trackWidth = () => Math.max(80, rowsViewport.clientWidth - labelWidth());
const pxPerMs = () => baseScale * zoom;
const viewWidth = () => trackWidth() / pxPerMs();
const timeOf = (x) => viewStart + x / pxPerMs();
const xOf = (ts) => (ts - viewStart) * pxPerMs();
const tailStart = (ts) => Math.max(minTs, ts - viewWidth() * 0.9);

const rowLabel = (row) => {
  const status = row.status === 'tool-calls' ? 'tools' : row.status === 'stop' ? 'done' : row.status || 'running';
  if (row.kind === 'execution') return 'execution · ' + status;
  if (row.kind === 'step') return 'step · ' + status;
  if (row.kind === 'tool') return 'tool · ' + (toolNameOf(row.line) || shortID(payloadOf(row.line).id) || 'call');
  if (row.kind === 'compaction') return 'compaction · ' + (payloadOf(row.line).reason || status);
  if (row.kind === 'prompt') return 'prompt';
  if (row.kind === 'permission') return row.line.type.replace('permission.', 'permission · ');
  return row.line.type;
};
const rowMeta = (row) => {
  const duration = fmtDuration(row.end - row.start);
  if (row.kind === 'step') {
    const result = row.endLine ?? row.line;
    const cost = costOf(result);
    return duration + (cost ? ' · $' + cost.toFixed(4) : '');
  }
  return duration;
};

const make = (kind, line, ts, depth, parent) => ({ kind, line, start: ts, end: null, depth, parent, status: 'running', endLine: null, open: true });
const point = (kind, line, ts, depth, parent, status) => ({ kind, line, start: ts, end: ts, depth, parent, status: status || '', endLine: null, open: false });
const close = (row, ts, status, endLine) => {
  if (row === null || row === undefined) return;
  row.end = ts;
  row.status = status;
  row.endLine = endLine;
  row.open = false;
};
const closeDescendants = (parent, ts, rows) => {
  for (const row of rows) {
    if (row.parent !== parent || !row.open) continue;
    close(row, ts, "closed", null);
    closeDescendants(row, ts, rows);
  }
};

const build = () => {
  const now = performance.timeOrigin + performance.now();
  const raw = [...(history.get(active) ?? []), ...(liveBySession.get(active) ?? [])].toSorted((a, b) => (a.ts || 0) - (b.ts || 0));
  const seen = new Set();
  const lines = [];
  for (const line of raw) {
    const payload = payloadOf(line);
    const key = line.ts + "|" + line.type + "|" + line.sessionID + "|" + (payload.id || "") + "|" + (payload.assistantMessageID || "") + "|" + (payload.cost || "") + "|" + (payload.finish || "");
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  const executions = [];
  const steps = new Map();
  const openSteps = [];
  const tools = new Map();
  const compactions = [];
  const next = [];
  let start = Infinity;
  let last = -Infinity;
  let rootLine = null;
  let lastType = '';
  for (const line of lines) {
    const ts = line.ts;
    if (!Number.isFinite(ts)) continue;
    start = Math.min(start, ts);
    last = Math.max(last, ts);
    lastType = line.type;
    if (line.type === 'session.created') { if (rootLine === null) rootLine = line; continue; }
    if (line.type === 'session.usage.updated') continue;
    if (line.type === 'session.execution.started') {
      const row = make('execution', line, ts, 0, null);
      executions.push(row);
      next.push(row);
      continue;
    }
    if (line.type === 'session.execution.succeeded' || line.type === 'session.execution.failed' || line.type === 'session.execution.interrupted') {
      const row = executions.pop();
      if (row === undefined) next.push(point('execution', line, ts, 0, null, line.type.split('.').at(-1)));
      else { close(row, ts, line.type.split(".").at(-1), line); closeDescendants(row, ts, next); }
      continue;
    }
    if (line.type === 'session.step.started') {
      const parent = executions.at(-1) ?? null;
      const started = typeof payloadOf(line).started === 'number' ? payloadOf(line).started : ts;
      const row = make('step', line, started, parent === null ? 0 : parent.depth + 1, parent);
      const messageID = payloadOf(line).assistantMessageID;
      if (typeof messageID === 'string') steps.set(messageID, row);
      openSteps.push(row);
      next.push(row);
      continue;
    }
    if (line.type === 'session.step.ended' || line.type === 'session.step.failed') {
      const messageID = payloadOf(line).assistantMessageID;
      const row = (typeof messageID === 'string' ? steps.get(messageID) : undefined) ?? openSteps.at(-1);
      const status = line.type.endsWith('.failed') ? 'failed' : (payloadOf(line).finish || 'ended');
      if (row === undefined) {
        const parent = executions.at(-1) ?? null;
        next.push(point('step', line, ts, parent === null ? 0 : parent.depth + 1, parent, status));
      } else {
        close(row, ts, status, line);
        closeDescendants(row, ts, next);
        const index = openSteps.indexOf(row);
        if (index !== -1) openSteps.splice(index, 1);
      }
      continue;
    }
    if (line.type === 'session.tool.called') {
      const messageID = payloadOf(line).assistantMessageID;
      const step = (typeof messageID === 'string' ? steps.get(messageID) : undefined) ?? openSteps.at(-1);
      const parent = step ?? executions.at(-1) ?? null;
      const row = make('tool', line, ts, parent === null ? 0 : parent.depth + 1, parent);
      const id = payloadOf(line).id;
      if (typeof id === 'string') tools.set(id, row);
      next.push(row);
      continue;
    }
    if (line.type === 'session.tool.success' || line.type === 'session.tool.failed') {
      const id = payloadOf(line).id;
      const row = typeof id === 'string' ? tools.get(id) : undefined;
      const status = line.type.endsWith('.failed') ? 'failed' : (payloadOf(line).metadata?.status || 'success');
      if (row === undefined) {
        const step = (typeof payloadOf(line).assistantMessageID === 'string' ? steps.get(payloadOf(line).assistantMessageID) : undefined) ?? openSteps.at(-1);
        const parent = step ?? executions.at(-1) ?? null;
        next.push(point('tool', line, ts, parent === null ? 0 : parent.depth + 1, parent, status));
      } else {
        close(row, ts, status, line);
        if (typeof id === "string") tools.delete(id);
      }
      continue;
    }
    if (line.type === 'session.compaction.started') {
      const parent = executions.at(-1) ?? null;
      const row = make('compaction', line, ts, parent === null ? 0 : parent.depth + 1, parent);
      compactions.push(row);
      next.push(row);
      continue;
    }
    if (line.type === 'session.compaction.ended' || line.type === 'session.compaction.failed') {
      const row = compactions.pop();
      if (row === undefined) {
        const parent = executions.at(-1) ?? null;
        next.push(point('compaction', line, ts, parent === null ? 0 : parent.depth + 1, parent, line.type.endsWith('.failed') ? 'failed' : 'ended'));
      } else close(row, ts, line.type.endsWith('.failed') ? 'failed' : 'ended', line);
      continue;
    }
    if (line.type === 'session.inbox.enqueued') {
      next.push(point('prompt', line, ts, 0, null, 'queued'));
      continue;
    }
    if (line.type === 'permission.asked' || line.type === 'permission.replied') {
      const step = openSteps.at(-1);
      const parent = step ?? executions.at(-1) ?? null;
      next.push(point('permission', line, ts, parent === null ? 0 : parent.depth + 1, parent, line.type.endsWith('.asked') ? 'asked' : 'replied'));
      continue;
    }
    if (line.type === 'session.retry.scheduled') {
      next.push(point('other', line, ts, 0, null, 'retry'));
    }
  }
  if (!Number.isFinite(start)) {
    rows = [];
    viewRows = [];
    lineCount = 0;
    minTs = now;
    maxTs = now;
    sessionActive = false;
    root = { start: now, end: now, line: null };
    return;
  }
  const recent = now - last < 120000;
  sessionActive = recent;
  for (const row of next) {
    if (!row.open) continue;
    row.end = sessionActive ? now : last;
    row.open = sessionActive;
  }
  for (const row of next.toSorted((a, b) => a.depth - b.depth)) {
    if (row.parent && row.parent.end !== null && row.parent.end < row.end) {
      row.end = row.parent.end;
      row.open = false;
    }
  }
  next.sort((a, b) => a.start - b.start || a.depth - b.depth);
  for (const row of next) row.children = [];
  for (const row of next) {
    if (row.parent) row.parent.children.push(row);
  }
  rows = next;
  lineCount = lines.length;
  root = { start, end: sessionActive ? now : last, line: rootLine };
  minTs = start;
  maxTs = sessionActive ? now : last;
};

const setBar = (element, from, to, pointBar) => {
  const width = trackWidth();
  const left = Math.max(0, Math.min(width, from));
  const right = Math.max(0, Math.min(width, to));
  if (right <= 0 || left >= width) {
    element.style.display = 'none';
    return;
  }
  element.style.display = 'block';
  element.style.left = left + 'px';
  element.style.width = pointBar ? '8px' : Math.max(2, right - left) + 'px';
};

const NICE_MS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 60000, 120000, 300000, 600000];
const renderAxis = () => {
  axis.replaceChildren();
  const width = trackWidth();
  const label = labelWidth();
  const target = viewWidth() / 5;
  const interval = NICE_MS.find((value) => value >= target) ?? 600000;
  const first = Math.ceil(viewStart / interval) * interval;
  for (let ts = first; ts <= viewStart + viewWidth(); ts += interval) {
    const tick = document.createElement('div');
    tick.className = 'tick';
    tick.style.left = label + xOf(ts) + 'px';
    tick.textContent = clockText(ts);
    axis.appendChild(tick);
  }
};

const renderRoot = () => {
  const icon = iconOf(root.line ?? { model: undefined }, 'session');
  rootLabel.replaceChildren();
  const image = document.createElement('img');
  image.src = icon.svg;
  image.alt = icon.label;
  const name = document.createElement('span');
  name.className = 'name';
  const title = sessionList.find((session) => session.sessionID === active)?.title;
  name.textContent = 'session · ' + (title || active || 'none');
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = fmtDuration(root.end - root.start);
  rootLabel.append(image, name, meta);
  rootBar.style.background = COLORS.execution;
  setBar(rootBar, xOf(root.start), xOf(root.end), false);
  titleEl.textContent = (active || 'live') + (historyError !== null ? ' · history unavailable' : '');
};

const rowElement = (row, index) => {
  const element = document.createElement('div');
  element.className = 'row' + (row === selected ? ' selected' : '');
  element.style.top = index * ROW_H + 'px';
  const label = document.createElement('div');
  label.className = 'row-label';
  label.style.paddingLeft = '4px';
  const guide = document.createElement('span');
  guide.className = 'guide';
  guide.style.width = row.depth * 16 + 'px';
  label.appendChild(guide);
  const accent = document.createElement('span');
  accent.className = 'accent';
  accent.style.background = COLORS[row.kind] ?? COLORS.other;
  label.appendChild(accent);
  if (row.children.length > 0) {
    const toggle = document.createElement('span');
    toggle.className = 'toggle';
    toggle.textContent = collapsed.has(row) ? '\u25B8' : '\u25BE';
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      if (collapsed.has(row)) collapsed.delete(row); else collapsed.add(row);
      applyFilter();
      renderRows();
    });
    label.appendChild(toggle);
  } else {
    const spacer = document.createElement('span');
    spacer.className = 'toggle';
    label.appendChild(spacer);
  }
  const icon = iconOf(row.line, row.kind === 'tool' ? 'tool' : 'provider');
  const image = document.createElement('img');
  image.src = icon.svg;
  image.alt = icon.label;
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = rowLabel(row);
  const service = document.createElement('span');
  service.className = 'svc';
  service.textContent = row.line.agent || providerOf(row.line) || '';
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = rowMeta(row);
  label.append(image, name, service, meta);
  const track = document.createElement('div');
  track.className = 'row-track';
  const bar = document.createElement('div');
  const pointBar = row.end - row.start < 2;
  bar.className = 'bar' + (pointBar ? ' point' : '');
  bar.style.background = COLORS[row.kind] ?? COLORS.other;
  if (!pointBar) {
    const barWidth = Math.max(0, xOf(row.end) - xOf(row.start));
    bar.textContent = barWidth >= 110 ? rowLabel(row) : barWidth >= 36 ? fmtDuration(row.end - row.start) : '';
  }
  setBar(bar, xOf(row.start), xOf(row.end), pointBar);
  track.appendChild(bar);
  element.append(label, track);
  element.addEventListener('pointerenter', (event) => showTip(row, event));
  element.addEventListener('pointermove', (event) => { if (!tip.hidden) positionTip(event); });
  element.addEventListener('pointerleave', hideTip);
  element.addEventListener('click', () => { if (!suppressClick) showDetail(row); });
  return element;
};

const renderRows = () => {
  const scroll = rowsViewport.scrollTop;
  const height = rowsViewport.clientHeight;
  const first = Math.max(0, Math.floor(scroll / ROW_H) - 4);
  const last = Math.min(viewRows.length, Math.ceil((scroll + height) / ROW_H) + 4);
  rowsEl.style.height = viewRows.length * ROW_H + 'px';
  const fragment = document.createDocumentFragment();
  for (let index = first; index < last; index += 1) {
    const row = viewRows[index];
    if (row !== undefined) fragment.appendChild(rowElement(row, index));
  }
  rowsEl.replaceChildren(fragment);
  trace.dataset.rows = String(viewRows.length);
  emptyEl.hidden = viewRows.length !== 0;
  emptyEl.textContent = historyError !== null
    ? 'History unavailable: ' + historyError
    : foldError !== null
      ? 'History unavailable: ' + foldError
      : rows.length === 0
        ? 'No telemetry yet. Run a session and reopen /mf-telemetry.'
        : 'No spans match this filter.';
};

const renderOverview = () => {
  const span = Math.max(1, root.end - minTs);
  const left = Math.max(0, Math.min(100, ((viewStart - minTs) / span) * 100));
  const width = Math.max(0.5, Math.min(100, (viewWidth() / span) * 100));
  overviewWindow.style.left = left + '%';
  overviewWindow.style.width = width + '%';
};

const renderAll = () => {
  renderAxis();
  renderRoot();
  renderRows();
  renderOverview();
};

const refreshTotals = () => {
  let cost = 0;
  let input = 0;
  let output = 0;
  for (const row of rows) {
    if (row.kind !== 'step') continue;
    const result = row.endLine ?? row.line;
    cost += costOf(result);
    const tokens = tokensOf(result);
    if (tokens) { input += tokens.input || 0; output += tokens.output || 0; }
  }
  totalsEl.textContent = lineCount + ' spans · $' + cost.toFixed(4) + ' · ' + input + ' in / ' + output + ' out';
};

const scrollToWindow = () => {
  const index = viewRows.findIndex((row) => row.start >= viewStart);
  rowsViewport.scrollTop = index === -1 ? Math.max(0, (viewRows.length - 1) * ROW_H) : Math.max(0, (index - 1) * ROW_H);
};
const flatten = (visible) => {
  const out = [];
  const walk = (items) => {
    for (const row of items) {
      if (!visible.has(row)) continue;
      out.push(row);
      if (!collapsed.has(row)) walk(row.children);
    }
  };
  walk(rows.filter((row) => row.parent === null));
  return out;
};
const applyFilter = () => {
  const query = filterEl.value.trim().toLowerCase();
  let visible = new Set(rows);
  if (query !== '') {
    visible = new Set();
    for (const row of rows) {
      const hay = (row.line.type + ' ' + rowLabel(row) + ' ' + (row.line.agent || '') + ' ' + modelOf(row.line) + ' ' + Object.keys(payloadOf(row.line)).join(' ')).toLowerCase();
      if (hay.includes(query)) visible.add(row);
    }
    for (const row of [...visible]) {
      let parent = row.parent;
      while (parent !== null && parent !== undefined) {
        visible.add(parent);
        parent = parent.parent;
      }
    }
  }
  viewRows = flatten(visible);
  if (selected !== null && !viewRows.includes(selected)) selected = null;
  refreshTotals();
  emptyEl.hidden = viewRows.length !== 0;
};

const FOLLOW_MS = 15000;
const fit = () => {
  baseScale = trackWidth() / Math.max(1000, maxTs - minTs);
  zoom = 1;
  viewStart = minTs;
  renderAll();
};
const followWindow = () => {
  const width = trackWidth();
  zoom = Math.max(0.02, Math.min(400, width / FOLLOW_MS / baseScale));
  viewStart = Math.max(minTs, maxTs - FOLLOW_MS * 0.9);
  renderAll();
};

const zoomAt = (x, factor) => {
  const before = timeOf(x);
  zoom = Math.max(0.02, Math.min(400, zoom * factor));
  viewStart = before - x / pxPerMs();
  follow = false;
  followEl.textContent = 'paused';
  renderAll();
};

const panBy = (delta) => {
  viewStart += delta * viewWidth() / 600;
  follow = false;
  followEl.textContent = 'paused';
  renderAll();
};

const positionTip = (event) => {
  const rect = trace.getBoundingClientRect();
  tip.style.left = Math.min(event.clientX - rect.left + 12, trace.clientWidth - 390) + 'px';
  tip.style.top = Math.min(event.clientY - rect.top + 12, trace.clientHeight - 110) + 'px';
};
const hideTip = () => { tip.hidden = true; };
const showTip = (row, event) => {
  const icon = iconOf(row.line, row.kind === 'tool' ? 'tool' : 'provider');
  const result = row.endLine ?? row.line;
  const tokens = tokensOf(result);
  const body = rowLabel(row) + '  ' + row.status +
    '\n' + new Date(row.start).toISOString().slice(11, 23) + ' → ' + new Date(row.end).toISOString().slice(11, 23) +
    '\nduration ' + (fmtDuration(row.end - row.start) || 'point') +
    (costOf(result) ? '\ncost $' + costOf(result).toFixed(4) : '') +
    (tokens ? '\ntokens ' + (tokens.input || 0) + ' in / ' + (tokens.output || 0) + ' out' : '') +
    '\n' + modelOf(row.line) + '  ' + (row.line.agent || '-') +
    '\npayload keys ' + Object.keys(payloadOf(row.line)).join(', ');
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
  positionTip(event);
};

const showDetail = (row) => {
  selected = row;
  const icon = iconOf(row.line, row.kind === 'tool' ? 'tool' : 'provider');
  detailIcon.src = icon.svg;
  detailIcon.alt = icon.label;
  detail.hidden = false;
  detailBody.textContent = JSON.stringify({
    ...row.line,
    kind: row.kind,
    depth: row.depth,
    start: row.start,
    end: row.end,
    duration: row.end - row.start,
    status: row.status,
    endEvent: row.endLine === null ? null : row.endLine.type,
  }, null, 2);
  detail.focus();
  renderRows();
};

const ensureVisible = (index) => {
  const top = index * ROW_H;
  const bottom = top + ROW_H;
  if (top < rowsViewport.scrollTop) rowsViewport.scrollTop = top;
  else if (bottom > rowsViewport.scrollTop + rowsViewport.clientHeight) rowsViewport.scrollTop = bottom - rowsViewport.clientHeight;
};

const selectedIndex = () => selected === null ? -1 : viewRows.indexOf(selected);
const moveSelection = (delta) => {
  if (viewRows.length === 0) return;
  const current = selectedIndex();
  const next = Math.max(0, Math.min(viewRows.length - 1, current === -1 ? 0 : current + delta));
  const row = viewRows[next];
  if (row === undefined) return;
  selected = row;
  ensureVisible(next);
  showDetail(row);
};

const handleKey = (event) => {
  if (event.key === 'Escape') { tip.hidden = true; detail.hidden = true; trace.focus(); return; }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    moveSelection(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    panBy(event.key === 'ArrowRight' ? 100 : -100);
    return;
  }
  if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomAt(trackWidth() / 2, 1.3); return; }
  if (event.key === '-' || event.key === '_') { event.preventDefault(); zoomAt(trackWidth() / 2, 1 / 1.3); }
};

let sessionTitle = '';
const renderSessions = () => {
  const scroll = sessionsEl.scrollTop;
  sessionsEl.replaceChildren();
  const ids = new Set(sessionList.map((session) => session.sessionID));
  for (const id of liveBySession.keys()) {
    if (!ids.has(id)) { sessionList.push({ sessionID: id, parentID: null, title: null }); ids.add(id); }
  }
  if (active !== null && !ids.has(active)) sessionList.push({ sessionID: active, parentID: null, title: null });
  const children = new Map();
  const roots = [];
  for (const session of sessionList) {
    const parent = session.parentID;
    if (typeof parent === 'string' && ids.has(parent) && parent !== session.sessionID) {
      const list = children.get(parent) ?? [];
      list.push(session);
      children.set(parent, list);
    } else roots.push(session);
  }
  for (const session of roots) {
    const add = (item, depth) => {
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = (depth > 0 ? '↳ ' : '') + (item.title || item.sessionID);
      link.style.paddingLeft = 6 + depth * 14 + 'px';
      link.className = item.sessionID === active ? 'active' : '';
      link.onclick = (event) => { event.preventDefault(); void openSession(item.sessionID); };
      sessionsEl.appendChild(link);
      for (const child of children.get(item.sessionID) ?? []) add(child, depth + 1);
    };
    add(session, 0);
  }
  sessionsEl.scrollTop = scroll;
};
const loadSessions = async () => {
  try {
    const data = await (await fetch('/api/sessions')).json();
    sessionList = Array.isArray(data) ? data : [];
    if (!Array.isArray(data)) historyError = 'session list unavailable';
  } catch {
    sessionList = [];
  }
  renderSessions();
};
const openSession = async (sessionID) => {
  active = sessionID;
  historyError = null;
  detail.hidden = true;
  selected = null;
  sessionTitle = sessionList.find((session) => session.sessionID === sessionID)?.title || '';
  if (!history.has(sessionID)) {
    try {
      const response = await fetch('/api/spans?session=' + encodeURIComponent(sessionID));
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('unexpected spans response');
      history.set(sessionID, data.map((row) => ({ ...row, type: row.type, ts: row.ts, payload: row.payload || {}, model: row.model })));
      historyError = null;
    } catch {
      history.delete(sessionID);
      historyError = 'history request failed';
    }
  }
  build();
  applyFilter();
  follow = true;
  followEl.textContent = 'following';
  if (sessionActive) {
    baseScale = trackWidth() / Math.max(1000, maxTs - minTs);
    followWindow();
    scrollToWindow();
    renderRows();
  } else fit();
  renderSessions();
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
      (history.get(active) ?? []).some((row) => resetFiles.includes(row.file)) ||
      (liveBySession.get(active) ?? []).some((line) => resetFiles.includes(line.file))
    );
    if (resetFiles.length > 0) {
      for (const [sessionID, values] of history) history.set(sessionID, values.filter((row) => !resetFiles.includes(row.file)));
      for (const [sessionID, values] of liveBySession) liveBySession.set(sessionID, values.filter((line) => !resetFiles.includes(line.file)));
    }
    let changed = resetActive;
    for (const line of body.lines) {
      const buffer = liveBySession.get(line.sessionID) ?? [];
      buffer.push(line);
      liveBySession.set(line.sessionID, buffer);
      if (line.sessionID === active) changed = true;
    }
    if (changed) {
      build();
      applyFilter();
      if (follow) {
        if (viewWidth() > FOLLOW_MS * 3) followWindow();
        else { viewStart = tailStart(maxTs); renderAll(); }
        scrollToWindow();
        renderRows();
      } else renderAll();
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
  await loadSessions();
  if (active === null && sessionList.length > 0) active = sessionList[0].sessionID;
  if (active !== null) await openSession(active);
  else { build(); applyFilter(); fit(); }
  await seekFold();
  seeded = true;
  await poll();
};

trace.addEventListener('wheel', (event) => {
  const rect = trace.getBoundingClientRect();
  const x = Math.max(0, Math.min(trackWidth(), event.clientX - rect.left - labelWidth()));
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    zoomAt(x, event.deltaY < 0 ? 1.2 : 1 / 1.2);
  } else if (event.shiftKey) {
    event.preventDefault();
    panBy(event.deltaY);
  }
}, { passive: false });
trace.addEventListener('pointerdown', (event) => {
  if (event.target.closest('#detail')) return;
  drag = { x: event.clientX, start: viewStart, moved: false };
  trace.setPointerCapture(event.pointerId);
});
trace.addEventListener('pointermove', (event) => {
  if (drag === null) return;
  const delta = event.clientX - drag.x;
  if (Math.abs(delta) < 3) return;
  drag.moved = true;
  viewStart = drag.start - delta / pxPerMs();
  follow = false;
  followEl.textContent = 'paused';
  renderAll();
});
trace.addEventListener('pointerup', () => {
  if (drag !== null && drag.moved) {
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
  }
  drag = null;
});
trace.addEventListener('pointercancel', () => { drag = null; });
trace.addEventListener('pointerleave', () => { hideTip(); });
trace.addEventListener('keydown', handleKey);
detail.addEventListener('keydown', handleKey);
detail.addEventListener('pointerdown', (event) => event.stopPropagation());
rowsViewport.addEventListener('scroll', () => {
  if (frame !== 0) return;
  frame = requestAnimationFrame(() => { frame = 0; renderRows(); });
});
followEl.onclick = () => { follow = true; followEl.textContent = 'following'; followWindow(); scrollToWindow(); renderRows(); };
document.getElementById('zoom-out').onclick = () => zoomAt(trackWidth() / 2, 1 / 1.4);
document.getElementById('zoom-in').onclick = () => zoomAt(trackWidth() / 2, 1.4);
document.getElementById('fit').onclick = () => { fit(); follow = false; followEl.textContent = 'paused'; };
document.getElementById('collapse-all').onclick = () => { for (const row of rows) if (row.children.length > 0) collapsed.add(row); applyFilter(); renderRows(); };
document.getElementById('expand-all').onclick = () => { collapsed.clear(); applyFilter(); renderRows(); };
document.getElementById('collapse-one').onclick = () => {
  const parents = rows.filter((row) => row.children.length > 0 && !collapsed.has(row));
  if (parents.length === 0) return;
  const shallowest = Math.min(...parents.map((row) => row.depth));
  for (const row of parents) if (row.depth === shallowest) collapsed.add(row);
  applyFilter();
  renderRows();
};
document.getElementById('close-detail').onclick = () => { detail.hidden = true; trace.focus(); };
document.getElementById('copy-detail').onclick = () => { navigator.clipboard?.writeText(detailBody.textContent || '').catch(() => {}); };
filterEl.addEventListener('input', () => { applyFilter(); renderRows(); });
overview.addEventListener('click', (event) => {
  const rect = overview.getBoundingClientRect();
  const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  viewStart = minTs + fraction * Math.max(1, root.end - minTs) - viewWidth() / 2;
  follow = false;
  followEl.textContent = 'paused';
  renderAll();
});
window.addEventListener('resize', () => { fit(); });
window.addEventListener('pagehide', () => { navigator.sendBeacon('/close', JSON.stringify({ id: CLIENT_ID })); });
window.addEventListener('pageshow', heartbeat);
setInterval(heartbeat, 30000);
setInterval(poll, 400);
setInterval(() => { void loadSessions(); }, 5000);
setInterval(() => {
  if (!sessionActive) return;
  const now = performance.timeOrigin + performance.now();
  root.end = now;
  maxTs = now;
  for (const row of rows) if (row.open) row.end = now;
  renderRoot();
  renderRows();
  renderOverview();
}, 1000);
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
        return new Response(page(options.sessionID), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
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
              parentID: null,
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
          if (result.reset) {
            try {
              await Fold.run({ directory, database });
            } catch {
              // The next successful fold repairs the derived DB.
            }
          }
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
