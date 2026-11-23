#!/usr/bin/env bun
/**
 * Render an mf-mode-observe trace (JSONL, one event per line) into one
 * self-contained HTML report: inline styles, inline SVG, a few lines of inline
 * script, no network. Runs on Bun, or on Node 22.18+ (type stripping).
 *
 *   bun report.ts <trace.jsonl> [--out <file.html>] [--title <text>]
 *
 * The trace is parsed at this boundary. A line that is not a valid event is
 * skipped and listed under "Trace health"; the rest of the report still renders.
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KINDS = [
  'run.start',
  'run.end',
  'phase.start',
  'phase.end',
  'worker.start',
  'worker.end',
  'ci.start',
  'ci.end',
  'check',
  'friction',
  'decision',
  'link',
  'todo',
  'note',
] as const;
export type Kind = (typeof KINDS)[number];

const STATUSES = ['ok', 'fail', 'skip'] as const;
export type Status = (typeof STATUSES)[number];

/** One trace line after parsing. `at` is `ts` in epoch milliseconds. */
export interface TraceEvent {
  readonly line: number;
  readonly ts: string;
  readonly at: number;
  readonly actor: string;
  readonly kind: Kind;
  readonly summary: string;
  readonly refs: ReadonlyArray<string>;
  readonly span: string | undefined;
  readonly status: Status | undefined;
  readonly calls: number | undefined;
  readonly secs: number | undefined;
  readonly note: string | undefined;
  readonly attrs: Readonly<Record<string, string>>;
}

export interface Problem {
  readonly line: number;
  readonly message: string;
}

export interface Trace {
  readonly events: ReadonlyArray<TraceEvent>;
  readonly problems: ReadonlyArray<Problem>;
}

const isKind = (value: string): value is Kind => (KINDS as ReadonlyArray<string>).includes(value);
const isStatus = (value: string): value is Status =>
  (STATUSES as ReadonlyArray<string>).includes(value);

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const count = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

type ParsedLine = { readonly event: TraceEvent } | { readonly problem: string };

const parseLine = (raw: string, line: number): ParsedLine => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { problem: 'not valid JSON' };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { problem: 'not a JSON object' };
  }
  const record = new Map(Object.entries(value));
  const version = record.get('v');
  if (version !== undefined && version !== 1) return { problem: 'unsupported v ' + String(version) };
  const ts = text(record.get('ts'));
  const at = ts === undefined ? Number.NaN : Date.parse(ts);
  if (ts === undefined || Number.isNaN(at)) return { problem: 'missing or unreadable ts' };
  const kind = text(record.get('kind')) ?? '';
  if (!isKind(kind)) return { problem: "unknown kind '" + kind + "'" };
  const status = text(record.get('status'));
  const summary = record.get('summary');
  const rawRefs = record.get('refs');
  const rawAttrs = record.get('attrs');
  const attrs: Record<string, string> = {};
  if (typeof rawAttrs === 'object' && rawAttrs !== null && !Array.isArray(rawAttrs)) {
    for (const [key, attr] of Object.entries(rawAttrs)) {
      if (typeof attr === 'string' || typeof attr === 'number' || typeof attr === 'boolean') {
        attrs[key] = String(attr);
      }
    }
  }
  return {
    event: {
      line,
      ts,
      at,
      actor: text(record.get('actor')) ?? 'lead',
      kind,
      summary: typeof summary === 'string' ? summary : '',
      refs: Array.isArray(rawRefs)
        ? rawRefs.filter((ref): ref is string => typeof ref === 'string' && ref !== '')
        : [],
      span: text(record.get('span')),
      status: status !== undefined && isStatus(status) ? status : undefined,
      calls: count(record.get('calls')),
      secs: count(record.get('secs')),
      note: text(record.get('note')),
      attrs,
    },
  };
};

/** Parse a whole trace. Events come back sorted by time, ties in file order. */
export const parseTrace = (source: string): Trace => {
  const events: Array<TraceEvent> = [];
  const problems: Array<Problem> = [];
  source.split(/\r?\n/).forEach((raw, index) => {
    if (raw.trim() === '') return;
    const parsed = parseLine(raw, index + 1);
    if ('event' in parsed) events.push(parsed.event);
    else problems.push({ line: index + 1, message: parsed.problem });
  });
  events.sort((a, b) => a.at - b.at || a.line - b.line);
  return { events, problems };
};

// ---------------------------------------------------------------------------
// The run model: what the report shows, derived from the events alone.

type Family = 'phase' | 'worker' | 'ci';

export interface Interval {
  readonly family: Family;
  readonly lane: string;
  readonly id: string;
  readonly label: string;
  readonly from: number;
  readonly to: number;
  readonly open: boolean;
  readonly status: Status | undefined;
  readonly depth: number;
  readonly start: TraceEvent;
  readonly end: TraceEvent | undefined;
}

export interface Lane {
  readonly id: string;
  readonly label: string;
  readonly role: 'lead' | 'worker' | 'actor' | 'ci';
}

export interface WorkerStat {
  readonly id: string;
  readonly task: string;
  readonly model: string;
  readonly from: number;
  readonly to: number;
  readonly open: boolean;
  readonly status: Status | undefined;
  readonly result: string;
  readonly calls: number | undefined;
  readonly checksOk: number;
  readonly checksFail: number;
  readonly friction: number;
  readonly frictionSecs: number;
  readonly outputs: ReadonlyArray<string>;
}

export interface GraphNode {
  readonly id: string;
  readonly type: string;
  readonly label: string;
  readonly sub: string;
  readonly layer: number;
  readonly row: number;
}

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly fail: boolean;
  /** A worker's input or output, as opposed to a `link` event the lead appended. */
  readonly structural: boolean;
}

export interface Kpi {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}

export interface RunModel {
  readonly title: string;
  readonly t0: number;
  readonly t1: number;
  readonly events: ReadonlyArray<TraceEvent>;
  readonly runStart: TraceEvent | undefined;
  readonly runEnd: TraceEvent | undefined;
  readonly lanes: ReadonlyArray<Lane>;
  readonly intervals: ReadonlyArray<Interval>;
  readonly milestones: ReadonlyArray<{ readonly at: number; readonly label: string }>;
  readonly workers: ReadonlyArray<WorkerStat>;
  readonly nodes: ReadonlyArray<GraphNode>;
  readonly edges: ReadonlyArray<GraphEdge>;
  readonly kpis: ReadonlyArray<Kpi>;
  readonly leadCalls: number | undefined;
  readonly busy: number;
  readonly serial: number;
  readonly peak: number;
  readonly problems: ReadonlyArray<Problem>;
}

const FAMILY_OF: Partial<Record<Kind, readonly [Family, 'start' | 'end']>> = {
  'phase.start': ['phase', 'start'],
  'phase.end': ['phase', 'end'],
  'worker.start': ['worker', 'start'],
  'worker.end': ['worker', 'end'],
  'ci.start': ['ci', 'start'],
  'ci.end': ['ci', 'end'],
};

const CI_LANE = 'ci';
const SEP = '\u{0}';

/** Which lane a span event belongs to, and the key its start and end share. */
const spanKey = (family: Family, event: TraceEvent): { lane: string; key: string } => {
  const name = event.span ?? event.summary;
  if (family === 'worker') return { lane: name, key: 'worker' + SEP + name };
  if (family === 'ci') return { lane: CI_LANE, key: 'ci' + SEP + name };
  return { lane: event.actor, key: 'phase' + SEP + event.actor + SEP + name };
};

const pairIntervals = (
  events: ReadonlyArray<TraceEvent>,
  t1: number,
  problems: Array<Problem>,
): Array<Omit<Interval, 'depth'>> => {
  const open = new Map<string, Array<TraceEvent>>();
  const done: Array<Omit<Interval, 'depth'>> = [];
  const close = (start: TraceEvent, family: Family, end: TraceEvent | undefined) => {
    const { lane } = spanKey(family, start);
    done.push({
      family,
      lane,
      id: start.span ?? start.summary,
      label: start.summary,
      from: start.at,
      to: end === undefined ? t1 : Math.max(end.at, start.at),
      open: end === undefined,
      status: end?.status,
      start,
      end,
    });
  };
  for (const event of events) {
    const role = FAMILY_OF[event.kind];
    if (role === undefined) continue;
    const [family, edge] = role;
    const { key } = spanKey(family, event);
    const stack = open.get(key) ?? [];
    if (edge === 'start') {
      stack.push(event);
      open.set(key, stack);
      continue;
    }
    const start = stack.pop();
    if (start === undefined) {
      problems.push({
        line: event.line,
        message: event.kind + ' with no matching start (' + (event.span ?? event.summary) + ')',
      });
      continue;
    }
    close(start, family, event);
  }
  for (const stack of open.values()) {
    for (const start of stack) {
      const role = FAMILY_OF[start.kind];
      if (role === undefined) continue;
      problems.push({
        line: start.line,
        message:
          start.kind + ' never ended (' + (start.span ?? start.summary) + '), drawn to the last event',
      });
      close(start, role[0], undefined);
    }
  }
  return done.sort((a, b) => a.from - b.from || a.start.line - b.start.line);
};

/** Nesting depth of each interval inside its lane, so nested phases draw inset. */
const withDepth = (intervals: ReadonlyArray<Omit<Interval, 'depth'>>): Array<Interval> => {
  const active = new Map<string, Array<number>>();
  return intervals.map((interval) => {
    const ends = (active.get(interval.lane) ?? []).filter((to) => to > interval.from);
    const depth = ends.length;
    ends.push(interval.to);
    active.set(interval.lane, ends);
    return { ...interval, depth };
  });
};

const unionLength = (ranges: ReadonlyArray<readonly [number, number]>): number => {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cursor = Number.NEGATIVE_INFINITY;
  for (const [from, to] of sorted) {
    const start = Math.max(from, cursor);
    if (to > start) total += to - start;
    cursor = Math.max(cursor, to);
  }
  return total;
};

const peakOverlap = (ranges: ReadonlyArray<readonly [number, number]>): number => {
  const points = ranges.flatMap(([from, to]): Array<readonly [number, number]> => [
    [from, 1],
    [to, -1],
  ]);
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let level = 0;
  let peak = 0;
  for (const [, delta] of points) {
    level += delta;
    peak = Math.max(peak, level);
  }
  return peak;
};

const refType = (ref: string): string => {
  const colon = ref.indexOf(':');
  return colon > 0 ? ref.slice(0, colon) : 'ref';
};

const refLabel = (ref: string): string => {
  const type = refType(ref);
  const id = ref.slice(type.length + 1) || ref;
  if (type === 'pr') return 'PR ' + id;
  if (type === 'issue') return 'issue ' + id;
  return id;
};

const GRAPH_TYPES = new Set(['issue', 'pr']);

const buildGraph = (
  events: ReadonlyArray<TraceEvent>,
  intervals: ReadonlyArray<Interval>,
): { nodes: Array<GraphNode>; edges: Array<GraphEdge> } => {
  const order: Array<string> = [];
  const subs = new Map<string, string>();
  const types = new Map<string, string>();
  const labels = new Map<string, string>();
  const edges = new Map<string, GraphEdge>();
  const node = (id: string, type: string, label: string, sub?: string) => {
    if (!types.has(id)) {
      order.push(id);
      types.set(id, type);
      labels.set(id, label);
    }
    if (sub !== undefined && !subs.has(id)) subs.set(id, sub);
  };
  const edge = (from: string, to: string, label: string, fail: boolean, structural: boolean) => {
    if (from === to) return;
    const key = from + SEP + to;
    const prior = edges.get(key);
    edges.set(key, {
      from,
      to,
      label: prior === undefined || prior.label === '' ? label : prior.label,
      fail: fail || (prior?.fail ?? false),
      structural: structural || (prior?.structural ?? false),
    });
  };
  for (const worker of intervals.filter((interval) => interval.family === 'worker')) {
    const id = 'worker:' + worker.id;
    const inputs = worker.start.refs.filter((ref) => GRAPH_TYPES.has(refType(ref)));
    for (const ref of inputs) node(ref, refType(ref), refLabel(ref), worker.label);
    node(
      id,
      'worker',
      worker.id,
      formatDuration(worker.to - worker.from) +
        (worker.open ? ', still running' : '') +
        (worker.status === 'fail' ? ', failed' : ''),
    );
    for (const ref of inputs) edge(ref, id, '', false, true);
    for (const ref of worker.end?.refs ?? []) {
      if (!GRAPH_TYPES.has(refType(ref)) || inputs.includes(ref)) continue;
      node(ref, refType(ref), refLabel(ref), 'from ' + worker.id);
      edge(id, ref, '', worker.status === 'fail', true);
    }
  }
  for (const event of events) {
    if (event.kind !== 'link' || event.refs.length < 2) continue;
    const [head, ...tail] = event.refs;
    if (head === undefined) continue;
    node(head, refType(head), refLabel(head));
    for (const ref of tail) {
      node(ref, refType(ref), refLabel(ref));
      edge(head, ref, event.summary, event.status === 'fail', false);
    }
  }
  if (order.length === 0) {
    const phases = intervals.filter(
      (interval) => interval.family === 'phase' && interval.depth === 0,
    );
    let previous: string | undefined;
    phases.forEach((phase, index) => {
      const id = 'phase:' + index;
      node(id, 'phase', phase.label, phase.lane + ', ' + formatDuration(phase.to - phase.from));
      if (previous !== undefined) edge(previous, id, '', false, true);
      previous = id;
    });
  }
  for (const event of events) {
    if (event.kind === 'link') continue;
    for (const ref of event.refs) {
      if (types.has(ref) && !subs.has(ref)) subs.set(ref, event.summary);
    }
  }
  const edgeList = [...edges.values()];
  const layer = layerNodes(order, edgeList);
  const rows = orderRows(order, edgeList, layer);
  const nodes = order.map((id) => ({
    id,
    type: types.get(id) ?? 'ref',
    label: labels.get(id) ?? id,
    sub: subs.get(id) ?? '',
    layer: layer.get(id) ?? 0,
    row: rows.get(id) ?? 0,
  }));
  return { nodes, edges: edgeList };
};

/**
 * Longest-path layers. Worker inputs and outputs always push a layer. A link
 * pushes only a node no worker produced, so two PRs linked by a stack stay in
 * the column of the workers that opened them. An edge that closes a cycle is
 * ignored for layering.
 */
const layerNodes = (
  order: ReadonlyArray<string>,
  edges: ReadonlyArray<GraphEdge>,
): Map<string, number> => {
  const produced = new Set(edges.filter((e) => e.structural).map((e) => e.to));
  const out = new Map<string, Array<string>>();
  for (const { from, to, structural } of edges) {
    if (structural || !produced.has(to)) out.set(from, [...(out.get(from) ?? []), to]);
  }
  const state = new Map<string, 'visiting' | 'done'>();
  const post: Array<string> = [];
  const forward = new Set<string>();
  const visit = (id: string) => {
    state.set(id, 'visiting');
    for (const next of out.get(id) ?? []) {
      const seen = state.get(next);
      if (seen === 'visiting') continue;
      forward.add(id + SEP + next);
      if (seen === undefined) visit(next);
    }
    state.set(id, 'done');
    post.push(id);
  };
  for (const id of order) if (!state.has(id)) visit(id);
  const layer = new Map<string, number>(order.map((id) => [id, 0]));
  for (const id of post.reverse()) {
    for (const next of out.get(id) ?? []) {
      if (!forward.has(id + SEP + next)) continue;
      layer.set(next, Math.max(layer.get(next) ?? 0, (layer.get(id) ?? 0) + 1));
    }
  }
  return layer;
};

/** Row inside each layer: first-seen order, then one barycenter sweep. */
const orderRows = (
  order: ReadonlyArray<string>,
  edges: ReadonlyArray<GraphEdge>,
  layer: ReadonlyMap<string, number>,
): Map<string, number> => {
  const row = new Map<string, number>();
  const layers = new Map<number, Array<string>>();
  for (const id of order) {
    const at = layer.get(id) ?? 0;
    layers.set(at, [...(layers.get(at) ?? []), id]);
  }
  const depth = Math.max(0, ...layers.keys());
  for (let at = 0; at <= depth; at += 1) {
    const ids = layers.get(at) ?? [];
    const score = (id: string, index: number): number => {
      const parents = edges
        .filter((e) => e.to === id && (layer.get(e.from) ?? 0) < at)
        .map((e) => row.get(e.from) ?? 0);
      return parents.length === 0 ? index : parents.reduce((a, b) => a + b, 0) / parents.length;
    };
    const ranked = ids
      .map((id, index) => ({ id, score: score(id, index), index }))
      .sort((a, b) => a.score - b.score || a.index - b.index);
    ranked.forEach(({ id }, index) => row.set(id, index));
  }
  return row;
};

const sum = (values: ReadonlyArray<number>): number => values.reduce((a, b) => a + b, 0);

const reported = (events: ReadonlyArray<TraceEvent>): number | undefined => {
  const calls = events.flatMap((event) => (event.calls === undefined ? [] : [event.calls]));
  return calls.length > 0 ? sum(calls) : undefined;
};

const plural = (n: number, word: string): string => n + ' ' + word + (n === 1 ? '' : 's');

export const buildModel = (trace: Trace, title?: string): RunModel => {
  const { events } = trace;
  const problems = [...trace.problems];
  const t0 = events[0]?.at ?? 0;
  const t1 = Math.max(events.at(-1)?.at ?? 0, t0 + 1000);
  const intervals = withDepth(pairIntervals(events, t1, problems));
  const runStart = events.find((event) => event.kind === 'run.start');
  const runEnd = [...events].reverse().find((event) => event.kind === 'run.end');

  const workerIntervals = intervals.filter((interval) => interval.family === 'worker');
  const lanes: Array<Lane> = [];
  if (events.some((event) => event.actor === 'lead')) {
    lanes.push({ id: 'lead', label: 'lead', role: 'lead' });
  }
  for (const id of new Set(workerIntervals.map((interval) => interval.lane))) {
    if (!lanes.some((lane) => lane.id === id)) lanes.push({ id, label: id, role: 'worker' });
  }
  for (const event of events) {
    const id = event.actor;
    if (id === CI_LANE || lanes.some((lane) => lane.id === id)) continue;
    lanes.push({ id, label: id, role: 'actor' });
  }
  if (
    intervals.some((interval) => interval.family === 'ci') ||
    events.some((event) => event.actor === CI_LANE)
  ) {
    lanes.push({ id: CI_LANE, label: 'CI', role: 'ci' });
  }

  const milestones: Array<{ at: number; label: string }> = [];
  const seenPrs = new Set<string>();
  for (const event of events) {
    for (const ref of event.refs) {
      if (refType(ref) !== 'pr' || seenPrs.has(ref)) continue;
      seenPrs.add(ref);
      milestones.push({ at: event.at, label: refLabel(ref) });
    }
  }

  const byActor = (actor: string, kind: Kind) =>
    events.filter((event) => event.actor === actor && event.kind === kind);
  const workers: Array<WorkerStat> = workerIntervals.map((interval) => {
    const checks = byActor(interval.lane, 'check');
    const friction = byActor(interval.lane, 'friction');
    const attrs = { ...interval.start.attrs, ...interval.end?.attrs };
    return {
      id: interval.lane,
      task: interval.label,
      model: [attrs['harness'], attrs['model'], attrs['effort']].filter(Boolean).join(' '),
      from: interval.from,
      to: interval.to,
      open: interval.open,
      status: interval.status,
      result: interval.end?.summary ?? '',
      calls: interval.end?.calls ?? reported(byActor(interval.lane, 'phase.end')),
      checksOk: checks.filter((event) => event.status !== 'fail').length,
      checksFail: checks.filter((event) => event.status === 'fail').length,
      friction: friction.length,
      frictionSecs: sum(friction.map((event) => event.secs ?? 0)),
      outputs: (interval.end?.refs ?? []).filter((ref) => GRAPH_TYPES.has(refType(ref))),
    };
  });

  const ranges = workerIntervals.map((interval): readonly [number, number] => [
    interval.from,
    interval.to,
  ]);
  const busy = unionLength(ranges);
  const serial = sum(ranges.map(([from, to]) => to - from));
  const peak = peakOverlap(ranges);
  const leadCalls = runEnd?.calls ?? reported(byActor('lead', 'phase.end'));
  const checks = events.filter((event) => event.kind === 'check');
  const failed = checks.filter((event) => event.status === 'fail').length;
  const friction = events.filter((event) => event.kind === 'friction');
  const todos = events.filter((event) => event.kind === 'todo').length;
  const frictionSecs = sum(friction.map((event) => event.secs ?? 0));
  const frictionCalls = sum(friction.map((event) => event.calls ?? 0));

  const kpis: Array<Kpi> = [
    {
      label: 'Wall clock',
      value: formatDuration(t1 - t0),
      detail: formatClock(t0) + ' to ' + formatClock(t1) + ' UTC',
    },
    {
      label: 'Workers',
      value: String(workerIntervals.length),
      detail:
        workerIntervals.length > 1
          ? 'up to ' + peak + ' at once: ' + formatDuration(busy) + ' busy vs ' +
            formatDuration(serial) + ' one after another'
          : workerIntervals.length === 1
            ? formatDuration(serial) + ' of worker time'
            : 'the lead did the work itself',
    },
    {
      label: 'Lead round-trips',
      value: leadCalls === undefined ? 'not logged' : String(leadCalls),
      detail: 'tool calls the lead reported',
    },
    {
      label: 'Checks',
      value: checks.length - failed + ' passed',
      detail: failed + ' failed of ' + checks.length,
    },
    {
      label: 'Friction',
      value: frictionSecs > 0 ? formatDuration(frictionSecs * 1000) : String(friction.length),
      detail:
        plural(friction.length, 'item') +
        (frictionCalls > 0 ? ', ' + plural(frictionCalls, 'wasted call') : ''),
    },
    {
      label: 'Pull requests',
      value: String(seenPrs.size),
      detail: plural(todos, 'item') + ' left for the operator',
    },
  ];

  const graph = buildGraph(events, intervals);
  return {
    title: title ?? runStart?.summary ?? 'mf-mode run',
    t0,
    t1,
    events,
    runStart,
    runEnd,
    lanes,
    intervals,
    milestones,
    workers,
    nodes: graph.nodes,
    edges: graph.edges,
    kpis,
    leadCalls,
    busy,
    serial,
    peak,
    problems: problems.sort((a, b) => a.line - b.line),
  };
};

// ---------------------------------------------------------------------------
// Rendering: pure model -> HTML string.

const pad = (value: number): string => String(value).padStart(2, '0');

export const formatClock = (at: number): string => {
  const date = new Date(at);
  return (
    pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes()) + ':' + pad(date.getUTCSeconds())
  );
};

export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return hours + 'h ' + pad(minutes) + 'm';
  if (minutes > 0) return minutes + 'm ' + pad(seconds) + 's';
  return seconds + 's';
};

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
      '<line x1="' + px + '" y1="' + (top - 6) + '" x2="' + px + '" y2="' + plotBottom + '" class="grid"/>',
      '<text x="' + px + '" y="' + (top - 12) + '" class="tick" text-anchor="middle">' + label + '</text>',
    );
  }

  for (const lane of model.lanes) {
    const y = laneY.get(lane.id) ?? top;
    parts.push(
      '<text x="' + (gutter - 12) + '" y="' + (y + laneHeight / 2 + 4) +
        '" class="lane" text-anchor="end"><title>' + escape(lane.label) + '</title>' +
        escape(clip(lane.label, 20)) + '</text>',
      '<line x1="' + gutter + '" y1="' + (y + laneHeight) + '" x2="' + (width - right) + '" y2="' +
        (y + laneHeight) + '" class="base"/>',
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
      '<rect x="' + num(x0) + '" y="' + (y0 + inset) + '" width="' + num(w) + '" height="' +
        (laneHeight - inset * 2) + '" rx="3" class="mark ' + cls + (interval.open ? ' open' : '') +
        '"' +
        tip([
          formatClock(interval.from) + ' to ' + formatClock(interval.to) + ' (' +
            formatDuration(interval.to - interval.from) + ')',
          interval.family + ' ' + interval.id +
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
        '<text x="' + num(x0 + 6) + '" y="' + (y0 + laneHeight / 2 + 4) + '" class="in-label">' +
          escape(clip(interval.label, room)) + '</text>',
      );
    }
    if (interval.family !== 'phase' && !interval.open && interval.status !== undefined) {
      if (interval.status === 'skip') continue;
      const ok = interval.status === 'ok';
      parts.push(
        '<text x="' + num(x0 + w + 4) + '" y="' + (y0 + laneHeight / 2 + 5) + '" class="glyph ' +
          (ok ? 'good' : 'critical') + '">' + (ok ? CHECK : CROSS) + '</text>',
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
          '<rect x="' + num(from) + '" y="' + (y0 + laneHeight - 5) + '" width="' +
            num(Math.max(2, cx - from)) + '" height="5" class="strip"/>',
        );
      }
      parts.push(
        '<path d="M' + num(cx) + ',' + (cy - 7) + ' L' + num(cx + 7) + ',' + (cy + 5) + ' L' +
          num(cx - 7) + ',' + (cy + 5) + ' Z" class="mark friction"' +
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
        '<path d="M' + num(cx) + ',' + (cy - 7) + ' L' + num(cx + 7) + ',' + cy + ' L' + num(cx) +
          ',' + (cy + 7) + ' L' + num(cx - 7) + ',' + cy + ' Z" class="mark ' +
          (failedCheck ? 'check-fail' : 'check-ok') + '"' +
          tip([when + ' check ' + (failedCheck ? 'failed' : 'passed'), event.summary, event.note]) +
          '/>',
      );
    } else if (event.kind === 'decision') {
      parts.push(
        '<circle cx="' + num(cx) + '" cy="' + cy + '" r="4.5" class="mark decision"' +
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
      '<line x1="' + px + '" y1="' + (top - 4) + '" x2="' + px + '" y2="' + (y - 10) +
        '" class="mile"/>',
      '<text x="' + px + '" y="' + y + '" class="tick" text-anchor="middle">' +
        escape(milestone.label) + '</text>',
    );
  });

  return (
    '<svg viewBox="0 0 ' + width + ' ' + height +
    '" role="img" aria-label="Timeline: one lane per lead, worker and CI">' + parts.join('') +
    '</svg>'
  );
};

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
    model.nodes.map((n) => [n.id, { x: margin + n.layer * columnWidth, y: margin + n.row * rowHeight }]),
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
      d = 'M' + x1 + ',' + y1 + ' C' + reach + ',' + y1 + ' ' + reach + ',' + y2 + ' ' + (x1 + 2) + ',' + y2;
      mx = reach - 4;
      my = (y1 + y2) / 2 + 9;
      anchor = 'start';
    } else if (b.x > a.x) {
      const x1 = a.x + nodeWidth;
      const y1 = a.y + nodeHeight / 2;
      const x2 = b.x - 2;
      const y2 = b.y + nodeHeight / 2;
      const bend = (x2 - x1) / 2;
      d = 'M' + x1 + ',' + y1 + ' C' + (x1 + bend) + ',' + y1 + ' ' + (x2 - bend) + ',' + y2 +
        ' ' + x2 + ',' + y2;
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
      '<path d="' + d + '" class="edge' + (edge.fail ? ' fail' : '') + '" marker-end="url(#arrow' +
        (edge.fail ? '-fail' : '') + ')"/>',
    );
    const labelKey = edge.from + SEP + edge.label;
    if (edge.label !== '' && !labelled.has(labelKey)) {
      labelled.add(labelKey);
      labels.push(
        '<text x="' + num(mx) + '" y="' + num(my - 5) + '" class="edge-label" text-anchor="' + anchor + '"' +
          tip([edge.from + ' to ' + edge.to, edge.label]) + '>' + (edge.fail ? CROSS + ' ' : '') +
          escape(clip(edge.label, 30)) + '</text>',
      );
    }
  }
  for (const n of model.nodes) {
    const p = at.get(n.id);
    if (p === undefined) continue;
    parts.push(
      '<g class="node ' + escape(n.type) + '"' + tip([n.id, n.sub]) + '><rect x="' + p.x + '" y="' +
        p.y + '" width="' + nodeWidth + '" height="' + nodeHeight + '" rx="8"/>' +
        '<text x="' + (p.x + 12) + '" y="' + (p.y + 19) + '" class="nt">' +
        escape(clip(n.label, 24)) + '</text>' +
        '<text x="' + (p.x + 12) + '" y="' + (p.y + 35) + '" class="ns">' + escape(clip(n.sub, 30)) +
        '</text></g>',
    );
  }
  const marker = (id: string, cls: string) =>
    '<marker id="' + id + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" ' +
    'markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="' + cls +
    '"/></marker>';
  return (
    '<svg viewBox="0 0 ' + width + ' ' + height + '" style="max-width:' + width +
    'px" role="img" aria-label="Paths: issues, workers and pull requests"><defs>' +
    marker('arrow', 'arrow') + marker('arrow-fail', 'arrow fail') + '</defs>' + parts.join('') +
    labels.join('') + '</svg>'
  );
};

const table = (
  head: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
  empty: string,
): string =>
  rows.length === 0
    ? '<p class="empty">' + escape(empty) + '</p>'
    : '<table><thead><tr>' + head.map((cell) => '<th>' + escape(cell) + '</th>').join('') +
      '</tr></thead><tbody>' +
      rows.map((row) => '<tr>' + row.map((cell) => '<td>' + cell + '</td>').join('') + '</tr>').join('') +
      '</tbody></table>';

const refsText = (refs: ReadonlyArray<string>): string =>
  refs.length === 0
    ? ''
    : ' <span class="refs">' + refs.map((ref) => '<code>' + escape(ref) + '</code>').join(' ') +
      '</span>';

const badge = (status: Status | undefined, open = false): string => {
  if (open) return '<span class="badge muted">' + ELLIPSIS + ' still running</span>';
  if (status === 'fail') return '<span class="badge critical">' + CROSS + ' failed</span>';
  if (status === 'skip') return '<span class="badge muted">skipped</span>';
  if (status === 'ok') return '<span class="badge good">' + CHECK + ' passed</span>';
  return '';
};

const when = (at: number): string => '<span class="when">' + formatClock(at) + '</span>';

const LIGHT =
  'color-scheme:light;--page:#f9f9f7;--surface:#fcfcfb;--ink:#0b0b0b;--ink-2:#52514e;' +
  '--muted:#898781;--grid:#e1e0d9;--axis:#c3c2b7;--border:rgba(11,11,11,.10);--phase:#2a78d6;' +
  '--worker:#1baf7a;--good:#0ca30c;--good-text:#006300;--serious:#ec835a;--critical:#d03b3b';
const DARK =
  'color-scheme:dark;--page:#0d0d0d;--surface:#1a1a19;--ink:#f0efec;--ink-2:#c3c2b7;' +
  '--muted:#898781;--grid:#2c2c2a;--axis:#383835;--border:rgba(255,255,255,.10);--phase:#3987e5;' +
  '--worker:#199e70;--good:#0ca30c;--good-text:#0ca30c;--serious:#ec835a;--critical:#d03b3b';

const STYLE = [
  '.viz-root{' + LIGHT + '}',
  '@media screen and (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])) .viz-root{' + DARK + '}}',
  '@media screen{:root[data-theme="dark"] .viz-root{' + DARK + '}}',
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
  '@media print{.viz-root{background:#fff;min-height:0}main{padding:0}.card,.kpi,tr{break-inside:avoid}h2{break-after:avoid}#tip{display:none!important}}',
].join('\n');

const SCRIPT = [
  '(function(){',
  "var m=/theme=(light|dark)/.exec(location.hash);if(m)document.documentElement.setAttribute('data-theme',m[1]);",
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
    model.runEnd === undefined ? 'no run.end yet' : 'run ' + (statusWord(model.runEnd.status) || 'ended'),
  ];
  const longest = Math.max(1, ...model.workers.map((w) => w.to - w.from));
  const workerRows = model.workers.map((w) => [
    '<b>' + escape(w.id) + '</b><br><span class="when">' + escape(clip(w.task, 80)) + '</span>',
    escape(w.model),
    '<span class="nowrap"><span class="bar" style="width:' + num((64 * (w.to - w.from)) / longest) +
      'px"></span>' + formatDuration(w.to - w.from) + '</span><br>' + when(w.from),
    w.calls === undefined ? '<span class="when">not logged</span>' : String(w.calls),
    w.checksOk + ' passed' +
      (w.checksFail > 0 ? ', <span class="badge critical">' + w.checksFail + ' failed</span>' : ''),
    w.friction === 0
      ? '0'
      : w.friction + (w.frictionSecs > 0 ? ' (' + formatDuration(w.frictionSecs * 1000) + ')' : ''),
    badge(w.status, w.open) + (w.result !== '' ? '<br>' + escape(w.result) : '') +
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
      [event.span !== undefined ? 'span ' + event.span : '', event.status ?? '', costText(event) ?? '']
        .filter((bit) => bit !== '')
        .join(', '),
    ),
  ]);
  const health = model.problems.map((problem) => ['line ' + problem.line, escape(problem.message)]);
  const swatch = (style: string, label: string, cls = '') =>
    '<span><i class="sw' + cls + '" style="' + style + '"></i>' + label + '</span>';

  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    '<title>' + escape(clip(model.title, 120)) + ' - mf-mode report</title>',
    '<style>' + STYLE + '</style></head>',
    '<body><div class="viz-root"><main>',
    '<h1>' + escape(model.title) + '</h1>',
    '<p class="sub">' + facts.map(escape).join(DOT) + DOT + '<code>' + escape(source) + '</code></p>',
    '<section class="kpis">' +
      model.kpis
        .map(
          (kpi) =>
            '<div class="kpi"><span class="label">' + escape(kpi.label) +
            '</span><span class="value">' + escape(kpi.value) + '</span><span class="detail">' +
            escape(kpi.detail) + '</span></div>',
        )
        .join('') +
      '</section>',
    '<h2>Timeline</h2>',
    '<div class="card">' + timeline(model) + '<div class="legend">' +
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
    '<div class="card">' + paths(model) + '<div class="legend">' +
      swatch('border-color:var(--axis);border-style:dashed', 'issue', ' box') +
      swatch('border-color:var(--worker)', 'worker', ' box') +
      swatch('border-color:var(--phase)', 'pull request', ' box') +
      swatch('background:var(--critical)', CROSS + ' a finding that breaks or changes its target', ' line') +
      '</div></div>',
    '<h2>Workers</h2>',
    '<div class="card">' +
      table(['Worker', 'Model', 'Wall clock', 'Calls', 'Checks', 'Friction', 'Result'], workerRows, 'No workers: the lead did the work itself.') +
      '</div>',
    '<h2>Friction</h2>',
    '<div class="card">' +
      table(['When', 'Who', 'What got in the way', 'Cost', 'Fix candidate'], frictionRows, 'No friction logged.') +
      '</div>',
    '<h2>Checks</h2>',
    '<div class="card">' + table(['When', 'Who', 'What was checked', 'Result'], checkRows, 'No checks logged.') + '</div>',
    '<h2>Decisions</h2>',
    '<div class="card">' + table(['When', 'Who', 'Decision', 'Why'], decisionRows, 'No decisions logged.') + '</div>',
    '<h2>Left for the operator</h2>',
    '<div class="card">' + table(['What', 'Refs'], todoRows, 'Nothing left for the operator.') + '</div>',
    '<h2>Phases</h2>',
    '<div class="card">' + table(['Who', 'Phase', 'Start', 'Took', 'Calls', 'Result'], phaseRows, 'No phases logged.') + '</div>',
    health.length > 0
      ? '<h2>Trace health</h2><div class="card">' + table(['Where', 'Problem'], health, '') + '</div>'
      : '',
    '<h2>Event log</h2>',
    '<div class="card"><details><summary>All ' + plural(model.events.length, 'event') + '</summary>' +
      table(['When', 'Who', 'Kind', 'Summary', 'Fields'], logRows, 'No events.') + '</details></div>',
    '<footer>Rendered by mf-mode-report from <code>' + escape(source) +
      '</code>. Self-contained, no network. Add <code>#theme=dark</code> or <code>#theme=light</code> to the URL to override the system theme.</footer>',
    '</main></div><div id="tip" role="tooltip"></div><script>' + SCRIPT + '</script></body></html>',
    '',
  ].join('\n');
};

// ---------------------------------------------------------------------------
// CLI shell.

const USAGE = 'usage: report.ts <trace.jsonl> [--out <file.html>] [--title <text>]';

export const defaultOut = (trace: string): string =>
  join(dirname(trace), basename(trace).replace(/\.jsonl?$/i, '') + '.report.html');

export interface Io {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

const processIo: Io = {
  out: (line) => process.stdout.write(line + '\n'),
  err: (line) => process.stderr.write('report.ts: ' + line + '\n'),
};

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Exit code: 0 rendered, 1 nothing to render or an IO failure, 2 bad arguments. */
export const main = (argv: ReadonlyArray<string>, io: Io = processIo): number => {
  let trace: string | undefined;
  let out: string | undefined;
  let title: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--help' || arg === '-h') {
      io.out(USAGE);
      return 0;
    }
    if (arg === '--out' || arg === '--title') {
      const value = argv[index + 1];
      if (value === undefined) {
        io.err(arg + ' needs a value. ' + USAGE);
        return 2;
      }
      if (arg === '--out') out = value;
      else title = value;
      index += 1;
    } else if (trace === undefined && !arg.startsWith('--')) {
      trace = arg;
    } else {
      io.err('unexpected argument ' + arg + '. ' + USAGE);
      return 2;
    }
  }
  if (trace === undefined) {
    io.err(USAGE);
    return 2;
  }
  let source: string;
  try {
    source = readFileSync(trace, 'utf8');
  } catch (error) {
    io.err('cannot read ' + trace + ': ' + message(error));
    return 1;
  }
  const parsed = parseTrace(source);
  if (parsed.events.length === 0) {
    io.err('no valid events in ' + trace + ' (' + plural(parsed.problems.length, 'unreadable line') + ')');
    return 1;
  }
  const model = buildModel(parsed, title);
  const target = resolve(out ?? defaultOut(trace));
  try {
    writeFileSync(target, renderReport(model, basename(trace)));
  } catch (error) {
    io.err('cannot write ' + target + ': ' + message(error));
    return 1;
  }
  if (model.problems.length > 0) {
    io.err(plural(model.problems.length, 'trace problem') + ', listed under Trace health in the report');
  }
  io.out(target);
  return 0;
};

const invokedDirectly = (): boolean => {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (invokedDirectly()) process.exitCode = main(process.argv.slice(2));
