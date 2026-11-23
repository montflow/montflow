import {
  formatClock,
  formatDuration,
  plural,
  type Kind,
  type RunModel,
  type Status,
  type TraceEvent,
} from '../trace/index.js';

/**
 * The run report: one self-contained HTML page from a {@link RunModel}. Inline
 * styles, inline SVG and a few lines of inline script; nothing loads over the
 * network. Dark only, on screen and in print. `#card` hides everything below
 * the paths diagram, which is what the PNG captures.
 * Pure: model in, string out.
 */

const escape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const ELLIPSIS = '\u{2026}';
const CHECK = '\u{2713}';
const CROSS = '\u{2717}';
const DOT = ' \u{b7} ';

const clip = (value: string, max: number): string =>
  value.length > max ? value.slice(0, max - 1).trimEnd() + ELLIPSIS : value;

const num = (value: number): string => String(Math.round(value * 10) / 10);

const tip = (lines: ReadonlyArray<string | undefined>): string =>
  ' tabindex="0" data-tip="' +
  escape(lines.filter((line): line is string => line !== undefined && line !== '').join('\n')) +
  '"';

const statusWord = (status: Status | undefined, open = false): string => {
  if (open) return 'still running';
  if (status === 'fail') return 'failed';
  if (status === 'skip') return 'skipped';
  if (status === 'ok') return 'passed';
  return '';
};

const costText = (event: TraceEvent): string | undefined => {
  const bits = [
    event.secs !== undefined ? formatDuration(event.secs * 1000) : undefined,
    event.calls !== undefined ? plural(event.calls, 'call') : undefined,
  ].filter((bit): bit is string => bit !== undefined);
  return bits.length > 0 ? bits.join(', ') : undefined;
};

const TICKS = [10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];

const timeline = (model: RunModel): string => {
  const width = 1000;
  const gutter = 150;
  const right = 24;
  const top = 30;
  const laneHeight = 34;
  const laneGap = 10;
  const span = Math.max(1000, model.t1 - model.t0);
  const x = (at: number) => gutter + ((at - model.t0) / span) * (width - gutter - right);
  const laneY = new Map(
    model.lanes.map((lane, index) => [lane.id, top + index * (laneHeight + laneGap)]),
  );
  const plotBottom = top + model.lanes.length * (laneHeight + laneGap) - laneGap;
  const height = plotBottom + 46;
  const parts: Array<string> = [];

  const step = (TICKS.find((seconds) => span / 1000 / seconds <= 10) ?? 86400) * 1000;
  for (let at = Math.ceil(model.t0 / step) * step; at <= model.t1; at += step) {
    const px = num(x(at));
    const label = formatClock(at).slice(0, step < 60000 ? 8 : 5);
    parts.push(
      '<line x1="' +
        px +
        '" y1="' +
        (top - 6) +
        '" x2="' +
        px +
        '" y2="' +
        plotBottom +
        '" class="grid"/>',
      '<text x="' +
        px +
        '" y="' +
        (top - 12) +
        '" class="tick" text-anchor="middle">' +
        label +
        '</text>',
    );
  }

  for (const lane of model.lanes) {
    const y = laneY.get(lane.id) ?? top;
    parts.push(
      '<text x="' +
        (gutter - 12) +
        '" y="' +
        (y + laneHeight / 2 + 4) +
        '" class="lane" text-anchor="end"><title>' +
        escape(lane.label) +
        '</title>' +
        escape(clip(lane.label, 20)) +
        '</text>',
      '<line x1="' +
        gutter +
        '" y1="' +
        (y + laneHeight) +
        '" x2="' +
        (width - right) +
        '" y2="' +
        (y + laneHeight) +
        '" class="base"/>',
    );
  }

  for (const interval of model.intervals) {
    const y0 = laneY.get(interval.lane);
    if (y0 === undefined) continue;
    const inset = Math.min(interval.depth, 2) * 7;
    const x0 = x(interval.from);
    const full = x(interval.to) - x0;
    const w = Math.max(2, full > 6 ? full - 2 : full);
    let cls: string = interval.family;
    if (interval.family === 'ci') {
      cls = interval.open ? 'ci-open' : interval.status === 'fail' ? 'ci-fail' : 'ci-ok';
    }
    const ending = interval.end?.summary ?? '';
    parts.push(
      '<rect x="' +
        num(x0) +
        '" y="' +
        (y0 + inset) +
        '" width="' +
        num(w) +
        '" height="' +
        (laneHeight - inset * 2) +
        '" rx="3" class="mark ' +
        cls +
        (interval.open ? ' open' : '') +
        '"' +
        tip([
          formatClock(interval.from) +
            ' to ' +
            formatClock(interval.to) +
            ' (' +
            formatDuration(interval.to - interval.from) +
            ')',
          interval.family +
            ' ' +
            interval.id +
            (interval.label !== interval.id ? ': ' + interval.label : ''),
          ending !== '' ? 'end: ' + ending : undefined,
          statusWord(interval.status, interval.open),
          interval.end?.calls !== undefined ? plural(interval.end.calls, 'call') : undefined,
        ]) +
        '/>',
    );
    const room = Math.floor((w - 12) / 6.4);
    if (interval.family === 'phase' && room >= 6 && laneHeight - inset * 2 >= 16) {
      parts.push(
        '<text x="' +
          num(x0 + 6) +
          '" y="' +
          (y0 + laneHeight / 2 + 4) +
          '" class="in-label">' +
          escape(clip(interval.label, room)) +
          '</text>',
      );
    }
    if (interval.family !== 'phase' && !interval.open && interval.status !== undefined) {
      if (interval.status === 'skip') continue;
      const ok = interval.status === 'ok';
      parts.push(
        '<text x="' +
          num(x0 + w + 4) +
          '" y="' +
          (y0 + laneHeight / 2 + 5) +
          '" class="glyph ' +
          (ok ? 'good' : 'critical') +
          '">' +
          (ok ? CHECK : CROSS) +
          '</text>',
      );
    }
  }

  for (const event of model.events) {
    const y0 = laneY.get(event.actor);
    if (y0 === undefined) continue;
    const cx = x(event.at);
    const cy = y0 + laneHeight / 2;
    const when = formatClock(event.at);
    if (event.kind === 'friction') {
      if (event.secs !== undefined && event.secs > 0) {
        const from = x(event.at - event.secs * 1000);
        parts.push(
          '<rect x="' +
            num(from) +
            '" y="' +
            (y0 + laneHeight - 5) +
            '" width="' +
            num(Math.max(2, cx - from)) +
            '" height="5" class="strip"/>',
        );
      }
      parts.push(
        '<path d="M' +
          num(cx) +
          ',' +
          (cy - 7) +
          ' L' +
          num(cx + 7) +
          ',' +
          (cy + 5) +
          ' L' +
          num(cx - 7) +
          ',' +
          (cy + 5) +
          ' Z" class="mark friction"' +
          tip([
            when + ' friction',
            event.summary,
            costText(event),
            event.note !== undefined ? 'fix: ' + event.note : undefined,
          ]) +
          '/>',
      );
    } else if (event.kind === 'check') {
      const failedCheck = event.status === 'fail';
      parts.push(
        '<path d="M' +
          num(cx) +
          ',' +
          (cy - 7) +
          ' L' +
          num(cx + 7) +
          ',' +
          cy +
          ' L' +
          num(cx) +
          ',' +
          (cy + 7) +
          ' L' +
          num(cx - 7) +
          ',' +
          cy +
          ' Z" class="mark ' +
          (failedCheck ? 'check-fail' : 'check-ok') +
          '"' +
          tip([when + ' check ' + (failedCheck ? 'failed' : 'passed'), event.summary, event.note]) +
          '/>',
      );
    } else if (event.kind === 'decision') {
      parts.push(
        '<circle cx="' +
          num(cx) +
          '" cy="' +
          cy +
          '" r="4.5" class="mark decision"' +
          tip([
            when + ' decision',
            event.summary,
            event.note !== undefined ? 'why: ' + event.note : undefined,
          ]) +
          '/>',
      );
    }
  }

  model.milestones.forEach((milestone, index) => {
    const px = num(x(milestone.at));
    const y = plotBottom + 16 + (index % 2) * 14;
    parts.push(
      '<line x1="' +
        px +
        '" y1="' +
        (top - 4) +
        '" x2="' +
        px +
        '" y2="' +
        (y - 10) +
        '" class="mile"/>',
      '<text x="' +
        px +
        '" y="' +
        y +
        '" class="tick" text-anchor="middle">' +
        escape(milestone.label) +
        '</text>',
    );
  });

  return (
    '<svg viewBox="0 0 ' +
    width +
    ' ' +
    height +
    '" role="img" aria-label="Timeline: one lane per lead, worker and CI">' +
    parts.join('') +
    '</svg>'
  );
};

const marker = (id: string, cls: string) =>
  '<marker id="' +
  id +
  '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" ' +
  'markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="' +
  cls +
  '"/></marker>';

const swatch = (style: string, label: string, cls = '') =>
  '<span><i class="sw' + cls + '" style="' + style + '"></i>' + label + '</span>';

const paths = (model: RunModel): string => {
  if (model.nodes.length === 0) {
    return '<p class="empty">No issues, pull requests or phases to draw.</p>';
  }
  const nodeWidth = 180;
  const nodeHeight = 46;
  const columnWidth = 250;
  const rowHeight = 64;
  const margin = 12;
  const columns = Math.max(...model.nodes.map((n) => n.layer)) + 1;
  const rows = Math.max(...model.nodes.map((n) => n.row)) + 1;
  const sameLayer = model.edges.some((e) => {
    const a = model.nodes.find((n) => n.id === e.from);
    const b = model.nodes.find((n) => n.id === e.to);
    return a !== undefined && b !== undefined && a.layer === b.layer;
  });
  const width = margin * 2 + (columns - 1) * columnWidth + nodeWidth + (sameLayer ? 130 : 0);
  const height = margin * 2 + (rows - 1) * rowHeight + nodeHeight + 24;
  const at = new Map(
    model.nodes.map((n) => [
      n.id,
      { x: margin + n.layer * columnWidth, y: margin + n.row * rowHeight },
    ]),
  );
  const parts: Array<string> = [];
  const labels: Array<string> = [];
  const labelled = new Set<string>();
  for (const edge of model.edges) {
    const a = at.get(edge.from);
    const b = at.get(edge.to);
    if (a === undefined || b === undefined) continue;
    let d: string;
    let mx: number;
    let my: number;
    let anchor = 'middle';
    if (b.x === a.x) {
      const x1 = a.x + nodeWidth;
      const y1 = a.y + nodeHeight / 2;
      const y2 = b.y + nodeHeight / 2;
      const reach = x1 + 28 + Math.min(40, Math.abs(y2 - y1) / 4);
      d =
        'M' +
        x1 +
        ',' +
        y1 +
        ' C' +
        reach +
        ',' +
        y1 +
        ' ' +
        reach +
        ',' +
        y2 +
        ' ' +
        (x1 + 2) +
        ',' +
        y2;
      mx = reach - 4;
      my = (y1 + y2) / 2 + 9;
      anchor = 'start';
    } else if (b.x > a.x) {
      const x1 = a.x + nodeWidth;
      const y1 = a.y + nodeHeight / 2;
      const x2 = b.x - 2;
      const y2 = b.y + nodeHeight / 2;
      const bend = (x2 - x1) / 2;
      d =
        'M' +
        x1 +
        ',' +
        y1 +
        ' C' +
        (x1 + bend) +
        ',' +
        y1 +
        ' ' +
        (x2 - bend) +
        ',' +
        y2 +
        ' ' +
        x2 +
        ',' +
        y2;
      mx = (x1 + x2) / 2;
      my = (y1 + y2) / 2;
    } else {
      const x1 = a.x + nodeWidth / 2;
      const y1 = a.y + nodeHeight;
      const x2 = b.x + nodeWidth / 2;
      const y2 = b.y + nodeHeight + 2;
      const dip = Math.max(y1, y2) + 22;
      d = 'M' + x1 + ',' + y1 + ' C' + x1 + ',' + dip + ' ' + x2 + ',' + dip + ' ' + x2 + ',' + y2;
      mx = (x1 + x2) / 2;
      my = dip - 4;
    }
    parts.push(
      '<path d="' +
        d +
        '" class="edge' +
        (edge.fail ? ' fail' : '') +
        '" marker-end="url(#arrow' +
        (edge.fail ? '-fail' : '') +
        ')"/>',
    );
    const labelKey = JSON.stringify([edge.from, edge.label]);
    if (edge.label !== '' && !labelled.has(labelKey)) {
      labelled.add(labelKey);
      labels.push(
        '<text x="' +
          num(mx) +
          '" y="' +
          num(my - 5) +
          '" class="edge-label" text-anchor="' +
          anchor +
          '"' +
          tip([edge.from + ' to ' + edge.to, edge.label]) +
          '>' +
          (edge.fail ? CROSS + ' ' : '') +
          escape(clip(edge.label, 30)) +
          '</text>',
      );
    }
  }
  for (const n of model.nodes) {
    const p = at.get(n.id);
    if (p === undefined) continue;
    parts.push(
      '<g class="node ' +
        escape(n.type) +
        '"' +
        tip([n.id, n.sub]) +
        '><rect x="' +
        p.x +
        '" y="' +
        p.y +
        '" width="' +
        nodeWidth +
        '" height="' +
        nodeHeight +
        '" rx="8"/>' +
        '<text x="' +
        (p.x + 12) +
        '" y="' +
        (p.y + 19) +
        '" class="nt">' +
        escape(clip(n.label, 24)) +
        '</text>' +
        '<text x="' +
        (p.x + 12) +
        '" y="' +
        (p.y + 35) +
        '" class="ns">' +
        escape(clip(n.sub, 30)) +
        '</text></g>',
    );
  }
  return (
    '<svg viewBox="0 0 ' +
    width +
    ' ' +
    height +
    '" style="max-width:' +
    width +
    'px" role="img" aria-label="Paths: issues, workers and pull requests"><defs>' +
    marker('arrow', 'arrow') +
    marker('arrow-fail', 'arrow fail') +
    '</defs>' +
    parts.join('') +
    labels.join('') +
    '</svg>'
  );
};

const table = (
  head: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
  empty: string,
): string =>
  rows.length === 0
    ? '<p class="empty">' + escape(empty) + '</p>'
    : '<table><thead><tr>' +
      head.map((cell) => '<th>' + escape(cell) + '</th>').join('') +
      '</tr></thead><tbody>' +
      rows
        .map((row) => '<tr>' + row.map((cell) => '<td>' + cell + '</td>').join('') + '</tr>')
        .join('') +
      '</tbody></table>';

const refsText = (refs: ReadonlyArray<string>): string =>
  refs.length === 0
    ? ''
    : ' <span class="refs">' +
      refs.map((ref) => '<code>' + escape(ref) + '</code>').join(' ') +
      '</span>';

const badge = (status: Status | undefined, open = false): string => {
  if (open) return '<span class="badge muted">' + ELLIPSIS + ' still running</span>';
  if (status === 'fail') return '<span class="badge critical">' + CROSS + ' failed</span>';
  if (status === 'skip') return '<span class="badge muted">skipped</span>';
  if (status === 'ok') return '<span class="badge good">' + CHECK + ' passed</span>';
  return '';
};

const when = (at: number): string => '<span class="when">' + formatClock(at) + '</span>';

const DARK =
  'color-scheme:dark;--page:#0d0d0d;--surface:#1a1a19;--ink:#f0efec;--ink-2:#c3c2b7;' +
  '--muted:#898781;--grid:#2c2c2a;--axis:#383835;--border:rgba(255,255,255,.10);--phase:#3987e5;' +
  '--worker:#199e70;--good:#0ca30c;--good-text:#0ca30c;--serious:#ec835a;--critical:#d03b3b';

const STYLE = [
  '.viz-root{' + DARK + '}',
  '*{box-sizing:border-box}body{margin:0}',
  '.viz-root{background:var(--page);color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;min-height:100vh}',
  'main{max-width:1100px;margin:0 auto;padding:40px 24px 72px}',
  'h1{font-size:26px;line-height:1.25;margin:0 0 6px}h2{font-size:17px;margin:40px 0 12px}',
  '.sub{color:var(--ink-2);margin:0 0 24px}',
  'code{font:12.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}',
  '.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}',
  '.kpi{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px}',
  '.kpi .label{color:var(--ink-2);font-size:13px}',
  '.kpi .value{display:block;font-size:24px;font-weight:600;font-variant-numeric:tabular-nums;margin:2px 0}',
  '.kpi .detail{color:var(--muted);font-size:12.5px}',
  '.card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;overflow-x:auto}',
  'svg{width:100%;height:auto;display:block;font-family:inherit}',
  '.grid{stroke:var(--grid);stroke-width:1}.base{stroke:var(--axis);stroke-width:1}',
  '.tick{fill:var(--muted);font-size:11px}.lane{fill:var(--ink);font-size:12px;font-weight:600}',
  '.mark{stroke:var(--surface);stroke-width:2;outline:none}.mark:hover,.mark:focus{stroke:var(--ink)}',
  '.phase{fill:var(--phase)}.worker{fill:var(--worker)}.open{opacity:.55}',
  '.ci-ok,.check-ok{fill:var(--good)}.ci-fail,.check-fail{fill:var(--critical)}.ci-open{fill:var(--muted)}',
  '.friction{fill:var(--serious)}.strip{fill:var(--serious);opacity:.8}.decision{fill:var(--ink-2)}',
  '.in-label{fill:#fff;font-size:11px;pointer-events:none}.glyph{font-size:13px;font-weight:700}.glyph.good{fill:var(--good-text)}.glyph.critical{fill:var(--critical)}',
  '.mile{stroke:var(--ink-2);stroke-width:1;opacity:.5}',
  '.node{outline:none}.node rect{fill:var(--surface);stroke:var(--axis);stroke-width:1.2}',
  '.node.pr rect{stroke:var(--phase);stroke-width:2}.node.worker rect{stroke:var(--worker);stroke-width:2}',
  '.node.issue rect{stroke-dasharray:4 3}.node:hover rect,.node:focus rect{stroke:var(--ink)}',
  '.nt{fill:var(--ink);font-size:12.5px;font-weight:600}.ns{fill:var(--ink-2);font-size:11px}',
  '.edge{fill:none;stroke:var(--muted);stroke-width:1.4}.edge.fail{stroke:var(--critical);stroke-dasharray:5 3}',
  '.arrow{fill:var(--muted)}.arrow.fail{fill:var(--critical)}',
  '.edge-label{fill:var(--ink-2);font-size:11px;paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round;outline:none}',
  '.legend{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:12px;font-size:12px;color:var(--ink-2)}',
  '.legend span{display:inline-flex;align-items:center;gap:6px}',
  '.sw{display:inline-block;width:12px;height:12px;border-radius:3px}',
  '.sw.dia{transform:rotate(45deg) scale(.8);border-radius:1px}',
  '.sw.tri{width:0;height:0;border-radius:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:12px solid var(--serious)}',
  '.sw.dot{border-radius:50%;width:9px;height:9px}.sw.line{width:2px;height:14px;border-radius:0}',
  '.sw.box{border:2px solid;border-radius:4px}',
  '.note{color:var(--muted);font-size:12.5px;margin:10px 0 0}',
  'table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;font-size:14px}',
  'th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--grid);vertical-align:top}',
  'th{color:var(--ink-2);font-weight:600;font-size:12.5px}tr:last-child td{border-bottom:none}',
  '.bar{display:inline-block;height:10px;border-radius:0 3px 3px 0;background:var(--worker);vertical-align:middle;margin-right:8px}',
  '.badge{white-space:nowrap;font-weight:600;font-size:13px}.badge.good{color:var(--good-text)}',
  '.badge.critical{color:var(--critical)}.badge.muted{color:var(--muted)}',
  '.nowrap{white-space:nowrap}.refs code{color:var(--ink-2)}.when{color:var(--muted);white-space:nowrap}.empty{color:var(--muted);margin:0}',
  'details summary{cursor:pointer;color:var(--ink-2);font-weight:600}details table{margin-top:10px}',
  'footer{margin-top:40px;color:var(--muted);font-size:12px}',
  '#tip{position:fixed;z-index:9;pointer-events:none;max-width:360px;padding:8px 10px;border-radius:8px;background:var(--ink);color:var(--surface);font-size:12.5px;line-height:1.45;white-space:pre-line;box-shadow:0 4px 16px rgba(0,0,0,.18);display:none}',
  '.viz-root.card [data-detail]{display:none}.viz-root.card main{padding-bottom:24px}',
  '@media print{.viz-root{-webkit-print-color-adjust:exact;print-color-adjust:exact;min-height:0}main{padding:28px 32px}.card,.kpi,tr{break-inside:avoid}h2{break-after:avoid}#tip{display:none!important}}',
  '@page{margin:0;background:#0d0d0d}html{background:#0d0d0d}',
].join('\n');

const SCRIPT = [
  '(function(){',
  "if(/(^#|&)card(&|$)/.test(location.hash))document.querySelector('.viz-root').classList.add('card');",
  "var t=document.getElementById('tip');",
  "function hide(){t.style.display='none'}",
  'function show(e){var n=e.target.closest&&e.target.closest("[data-tip]");if(!n){hide();return}',
  "t.textContent=n.getAttribute('data-tip');t.style.display='block';",
  "var r=n.getBoundingClientRect(),k=e.type==='focusin',x=k?r.left+r.width/2:e.clientX,y=k?r.top:e.clientY;",
  "t.style.left=Math.max(8,Math.min(innerWidth-t.offsetWidth-8,x+12))+'px';",
  "t.style.top=(y-t.offsetHeight-12<8?y+16:y-t.offsetHeight-12)+'px'}",
  "document.addEventListener('pointermove',show);document.addEventListener('focusin',show);",
  "document.addEventListener('focusout',hide);document.documentElement.addEventListener('pointerleave',hide);",
  '})();',
].join('\n');

export const renderReport = (model: RunModel, source: string): string => {
  const facts = [
    new Date(model.t0).toISOString().slice(0, 10),
    ...Object.entries(model.runStart?.attrs ?? {}).map(([key, value]) => key + ' ' + value),
    plural(model.events.length, 'event'),
    model.runEnd === undefined
      ? 'no run.end yet'
      : 'run ' + (statusWord(model.runEnd.status) || 'ended'),
  ];
  const longest = Math.max(1, ...model.workers.map((w) => w.to - w.from));
  const workerRows = model.workers.map((w) => [
    '<b>' + escape(w.id) + '</b><br><span class="when">' + escape(clip(w.task, 80)) + '</span>',
    escape(w.model),
    '<span class="nowrap"><span class="bar" style="width:' +
      num((64 * (w.to - w.from)) / longest) +
      'px"></span>' +
      formatDuration(w.to - w.from) +
      '</span><br>' +
      when(w.from),
    w.calls === undefined ? '<span class="when">not logged</span>' : String(w.calls),
    w.checksOk +
      ' passed' +
      (w.checksFail > 0 ? ', <span class="badge critical">' + w.checksFail + ' failed</span>' : ''),
    w.friction === 0
      ? '0'
      : w.friction + (w.frictionSecs > 0 ? ' (' + formatDuration(w.frictionSecs * 1000) + ')' : ''),
    badge(w.status, w.open) +
      (w.result !== '' ? '<br>' + escape(w.result) : '') +
      (w.outputs.length > 0 ? '<br>' + refsText(w.outputs) : ''),
  ]);
  const of = (kind: Kind) => model.events.filter((event) => event.kind === kind);
  const frictionRows = of('friction').map((event) => [
    when(event.at),
    escape(event.actor),
    escape(event.summary) + refsText(event.refs),
    escape(costText(event) ?? ''),
    escape(event.note ?? ''),
  ]);
  const checkRows = of('check').map((event) => [
    when(event.at),
    escape(event.actor),
    escape(event.summary) +
      (event.note !== undefined ? '<br><code>' + escape(event.note) + '</code>' : '') +
      refsText(event.refs),
    badge(event.status ?? 'ok'),
  ]);
  const decisionRows = of('decision').map((event) => [
    when(event.at),
    escape(event.actor),
    escape(event.summary) + refsText(event.refs),
    escape(event.note ?? ''),
  ]);
  const todoRows = of('todo').map((event) => [
    escape(event.summary) +
      (event.note !== undefined ? '<br><span class="when">' + escape(event.note) + '</span>' : ''),
    refsText(event.refs),
  ]);
  const phaseRows = model.intervals
    .filter((interval) => interval.family === 'phase')
    .map((phase) => [
      escape(phase.lane),
      escape(phase.label),
      when(phase.from),
      formatDuration(phase.to - phase.from),
      phase.end?.calls === undefined ? '' : String(phase.end.calls),
      badge(phase.status, phase.open),
    ]);
  const logRows = model.events.map((event) => [
    when(event.at),
    escape(event.actor),
    '<code>' + event.kind + '</code>',
    escape(event.summary) +
      (event.note !== undefined ? '<br><span class="when">' + escape(event.note) + '</span>' : '') +
      refsText(event.refs),
    escape(
      [
        event.span !== undefined ? 'span ' + event.span : '',
        event.status ?? '',
        costText(event) ?? '',
      ]
        .filter((bit) => bit !== '')
        .join(', '),
    ),
  ]);
  const health = model.problems.map((problem) => ['line ' + problem.line, escape(problem.message)]);

  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="dark">',
    '<title>' + escape(clip(model.title, 120)) + ' - mf-mode report</title>',
    '<style>' + STYLE + '</style></head>',
    '<body><div class="viz-root"><main>',
    '<h1>' + escape(model.title) + '</h1>',
    '<p class="sub">' +
      facts.map(escape).join(DOT) +
      DOT +
      '<code>' +
      escape(source) +
      '</code></p>',
    '<section class="kpis">' +
      model.kpis
        .map(
          (kpi) =>
            '<div class="kpi"><span class="label">' +
            escape(kpi.label) +
            '</span><span class="value">' +
            escape(kpi.value) +
            '</span><span class="detail">' +
            escape(kpi.detail) +
            '</span></div>',
        )
        .join('') +
      '</section>',
    '<h2>Timeline</h2>',
    '<div class="card">' +
      timeline(model) +
      '<div class="legend">' +
      swatch('background:var(--phase)', 'phase') +
      swatch('background:var(--worker)', 'worker') +
      swatch('background:var(--good)', 'CI ' + CHECK + ' passed') +
      swatch('background:var(--critical)', 'CI ' + CROSS + ' failed') +
      swatch('background:var(--good)', 'check passed', ' dia') +
      swatch('background:var(--critical)', 'check failed', ' dia') +
      swatch('', 'friction (strip: time lost)', ' tri') +
      swatch('background:var(--ink-2)', 'decision', ' dot') +
      swatch('background:var(--ink-2)', 'first mention of a PR', ' line') +
      '</div><p class="note">Times are UTC. Hover or focus a mark for details. A faded bar never got its end event.</p></div>',
    '<h2>Paths</h2>',
    '<div class="card">' +
      paths(model) +
      '<div class="legend">' +
      swatch('border-color:var(--axis);border-style:dashed', 'issue', ' box') +
      swatch('border-color:var(--worker)', 'worker', ' box') +
      swatch('border-color:var(--phase)', 'pull request', ' box') +
      swatch(
        'background:var(--critical)',
        CROSS + ' a finding that breaks or changes its target',
        ' line',
      ) +
      '</div></div>',
    '<div data-detail>',
    '<h2>Workers</h2>',
    '<div class="card">' +
      table(
        ['Worker', 'Model', 'Wall clock', 'Calls', 'Checks', 'Friction', 'Result'],
        workerRows,
        'No workers: the lead did the work itself.',
      ) +
      '</div>',
    '<h2>Friction</h2>',
    '<div class="card">' +
      table(
        ['When', 'Who', 'What got in the way', 'Cost', 'Fix candidate'],
        frictionRows,
        'No friction logged.',
      ) +
      '</div>',
    '<h2>Checks</h2>',
    '<div class="card">' +
      table(['When', 'Who', 'What was checked', 'Result'], checkRows, 'No checks logged.') +
      '</div>',
    '<h2>Decisions</h2>',
    '<div class="card">' +
      table(['When', 'Who', 'Decision', 'Why'], decisionRows, 'No decisions logged.') +
      '</div>',
    '<h2>Left for the operator</h2>',
    '<div class="card">' +
      table(['What', 'Refs'], todoRows, 'Nothing left for the operator.') +
      '</div>',
    '<h2>Phases</h2>',
    '<div class="card">' +
      table(['Who', 'Phase', 'Start', 'Took', 'Calls', 'Result'], phaseRows, 'No phases logged.') +
      '</div>',
    health.length > 0
      ? '<h2>Trace health</h2><div class="card">' +
        table(['Where', 'Problem'], health, '') +
        '</div>'
      : '',
    '<h2>Event log</h2>',
    '<div class="card"><details><summary>All ' +
      plural(model.events.length, 'event') +
      '</summary>' +
      table(['When', 'Who', 'Kind', 'Summary', 'Fields'], logRows, 'No events.') +
      '</details></div>',
    '<footer>Rendered by mf-mode-report from <code>' +
      escape(source) +
      '</code>. Self-contained, no network. Add <code>#card</code> to the URL for the summary alone.</footer>',
    '</div>',
    '</main></div><div id="tip" role="tooltip"></div><script>' + SCRIPT + '</script></body></html>',
    '',
  ].join('\n');
};
