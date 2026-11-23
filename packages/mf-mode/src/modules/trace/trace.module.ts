import { Result, Schema } from 'effect';

/**
 * The mf-mode-observe trace: one JSON event per line, appended while a run
 * works. This module parses it at the boundary (a bad line becomes a
 * {@link Problem}, never a crash) and folds the events into the {@link RunModel}
 * the report renders. Pure: no IO.
 */

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

export const STATUSES = ['ok', 'fail', 'skip'] as const;
export type Status = (typeof STATUSES)[number];

/** One line as written, before the kind and the time are checked. */
export const TraceLine = Schema.Struct({
  v: Schema.optional(Schema.Literal(1)),
  ts: Schema.String,
  actor: Schema.optional(Schema.String),
  kind: Schema.String,
  summary: Schema.optional(Schema.String),
  span: Schema.optional(Schema.String),
  status: Schema.optional(Schema.Literals(STATUSES)),
  refs: Schema.optional(Schema.Array(Schema.String)),
  calls: Schema.optional(Schema.Number),
  secs: Schema.optional(Schema.Number),
  note: Schema.optional(Schema.String),
  attrs: Schema.optional(
    Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
  ),
});

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

const isKind = (value: string): value is Kind => KINDS.some((kind) => kind === value);

const nonEmpty = (value: string | undefined): string | undefined =>
  value === undefined || value === '' ? undefined : value;

const firstLine = (message: string): string => message.split('\n')[0] ?? message;

type Parsed = { readonly event: TraceEvent } | { readonly problem: string };

const parseLine = (raw: string, line: number): Parsed => {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { problem: 'not valid JSON' };
  }
  const result = Schema.decodeUnknownResult(TraceLine)(json);
  if (Result.isFailure(result)) {
    return { problem: 'not a trace event: ' + firstLine(result.failure.message) };
  }
  const value = result.success;
  const at = Date.parse(value.ts);
  if (Number.isNaN(at)) return { problem: "unreadable ts '" + value.ts + "'" };
  if (!isKind(value.kind)) return { problem: "unknown kind '" + value.kind + "'" };
  const event: TraceEvent = {
    line,
    ts: value.ts,
    at,
    actor: nonEmpty(value.actor) ?? 'lead',
    kind: value.kind,
    summary: value.summary ?? '',
    refs: (value.refs ?? []).filter((ref) => ref !== ''),
    span: nonEmpty(value.span),
    status: value.status,
    calls: value.calls,
    secs: value.secs,
    note: nonEmpty(value.note),
    attrs: Object.fromEntries(
      Object.entries(value.attrs ?? {}).map(([key, attr]) => [key, String(attr)]),
    ),
  };
  return { event };
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
  return { events: events.toSorted((a, b) => a.at - b.at || a.line - b.line), problems };
};

const pad = (value: number): string => String(value).padStart(2, '0');

/** HH:MM:SS in UTC. */
export const formatClock = (at: number): string => {
  const date = new Date(at);
  return (
    pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes()) + ':' + pad(date.getUTCSeconds())
  );
};

/** A duration in the largest two units: 42s, 12m 24s, 1h 04m. */
export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return hours + 'h ' + pad(minutes) + 'm';
  if (minutes > 0) return minutes + 'm ' + pad(seconds) + 's';
  return seconds + 's';
};

export const plural = (n: number, word: string): string => n + ' ' + word + (n === 1 ? '' : 's');

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

const FAMILIES = ['phase', 'worker', 'ci'] as const;

/** The span family and edge of a `*.start` or `*.end` kind; undefined for a point event. */
const roleOf = (kind: Kind) => {
  const family = FAMILIES.find((name) => kind === name + '.start' || kind === name + '.end');
  if (family === undefined) return undefined;
  const edge: 'start' | 'end' = kind.endsWith('.start') ? 'start' : 'end';
  return { family, edge };
};

/** The lane CI spans and the ${BT}ci${BT} actor draw in. */
export const CI_LANE = 'ci';
const SEP = '\u{0}';

/** Which lane a span event belongs to, and the key its start and end share. */
const spanKey = (family: Family, event: TraceEvent) => {
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
    const role = roleOf(event.kind);
    if (role === undefined) continue;
    const { family, edge } = role;
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
      const role = roleOf(start.kind);
      if (role === undefined) continue;
      problems.push({
        line: start.line,
        message:
          start.kind +
          ' never ended (' +
          (start.span ?? start.summary) +
          '), drawn to the last event',
      });
      close(start, role.family, undefined);
    }
  }
  return done.toSorted((a, b) => a.from - b.from || a.start.line - b.start.line);
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
  const sorted = ranges.toSorted((a, b) => a[0] - b[0]);
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
  let level = 0;
  let peak = 0;
  for (const [, delta] of points.toSorted((a, b) => a[0] - b[0] || a[1] - b[1])) {
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

const buildGraph = (events: ReadonlyArray<TraceEvent>, intervals: ReadonlyArray<Interval>) => {
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
  for (const id of post.toReversed()) {
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
      .toSorted((a, b) => a.score - b.score || a.index - b.index);
    ranked.forEach(({ id }, index) => row.set(id, index));
  }
  return row;
};

const sum = (values: ReadonlyArray<number>): number => values.reduce((a, b) => a + b, 0);

const reported = (events: ReadonlyArray<TraceEvent>): number | undefined => {
  const calls = events.flatMap((event) => (event.calls === undefined ? [] : [event.calls]));
  return calls.length > 0 ? sum(calls) : undefined;
};

export const buildModel = (trace: Trace, title?: string): RunModel => {
  const { events } = trace;
  const problems = [...trace.problems];
  const t0 = events[0]?.at ?? 0;
  const t1 = Math.max(events.at(-1)?.at ?? 0, t0 + 1000);
  const intervals = withDepth(pairIntervals(events, t1, problems));
  const runStart = events.find((event) => event.kind === 'run.start');
  const runEnd = events.toReversed().find((event) => event.kind === 'run.end');

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
          ? 'up to ' +
            peak +
            ' at once: ' +
            formatDuration(busy) +
            ' busy vs ' +
            formatDuration(serial) +
            ' one after another'
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
    problems: problems.toSorted((a, b) => a.line - b.line),
  };
};
