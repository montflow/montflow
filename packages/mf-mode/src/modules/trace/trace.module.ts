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

/** What the Paths diagram tells: the playbook, its steps in order, who ran each, what each produced. */
export interface Story {
  /** `playbook` on `run.start`. */
  readonly playbook: string | undefined;
  /** The `run.start` summary, '' without one. */
  readonly goal: string;
  /** Issue refs on `run.start`. */
  readonly inputs: ReadonlyArray<string>;
  /** Workers and outputs outside any lead phase: they hang off the playbook. */
  readonly loose: StoryLane;
  /** The lead's top-level phases, in start order. */
  readonly steps: ReadonlyArray<StoryStep>;
  /** `link` events between two outputs the story already holds. */
  readonly links: ReadonlyArray<StoryLink>;
}

export interface StoryLane {
  readonly workers: ReadonlyArray<StoryWorker>;
  readonly outputs: ReadonlyArray<StoryOutput>;
}

export interface StoryStep extends StoryLane {
  readonly id: string;
  readonly label: string;
  /** The skill the step routed to, or the playbook it ran: `skill` or `playbook` on `phase.start`. */
  readonly via: string | undefined;
  readonly from: number;
  readonly to: number;
  readonly open: boolean;
  readonly status: Status | undefined;
}

export interface StoryWorker {
  readonly id: string;
  readonly task: string;
  readonly playbook: string | undefined;
  /** The skill that spawned it. */
  readonly via: string | undefined;
  readonly model: string;
  readonly from: number;
  readonly to: number;
  readonly open: boolean;
  readonly status: Status | undefined;
  /** Issue refs on `worker.start`. */
  readonly inputs: ReadonlyArray<string>;
  readonly outputs: ReadonlyArray<StoryOutput>;
}

export interface StoryOutput {
  readonly ref: string;
  /** A PR's CI state when CI ran on it, else the summary of the event that produced it. */
  readonly note: string;
  readonly fail: boolean;
}

export interface StoryLink {
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly fail: boolean;
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
  readonly story: Story;
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

/** The type of a `type:id` ref: `pr`, `issue`, `branch`; `ref` without one. */
export const refType = (ref: string): string => {
  const colon = ref.indexOf(':');
  return colon > 0 ? ref.slice(0, colon) : 'ref';
};

/** A ref as a person reads it: PR #55, issue #23, a branch name, commit 2e99d6f, a URL's host and path. */
export const refLabel = (ref: string): string => {
  const type = refType(ref);
  const id = ref.slice(type.length + 1) || ref;
  if (type === 'pr') return 'PR ' + id;
  if (type === 'issue') return 'issue ' + id;
  if (type === 'commit') return 'commit ' + id;
  if (type === 'url' && URL.canParse(id)) {
    const url = new URL(id);
    return url.host + url.pathname.replace(/\/$/, '');
  }
  return id;
};

/** The refs the Workers table lists as a worker's outputs. */
const RESULT_TYPES = new Set(['issue', 'pr']);

const isIssue = (ref: string): boolean => refType(ref) === 'issue';

const modelOf = (attrs: Readonly<Record<string, string>>): string =>
  [attrs['harness'], attrs['model'], attrs['effort']].filter(Boolean).join(' ');

const CI_WORDS = { ok: 'CI passed', fail: 'CI failed', skip: 'CI skipped' } as const;

/** The state of the last CI span whose refs name this PR. */
const ciNote = (ref: string, intervals: ReadonlyArray<Interval>): string | undefined => {
  const last = intervals.findLast(
    (interval) =>
      interval.family === 'ci' &&
      (interval.start.refs.includes(ref) || (interval.end?.refs.includes(ref) ?? false)),
  );
  if (last === undefined) return undefined;
  if (last.open) return 'CI running';
  return last.status === undefined ? 'CI ended' : CI_WORDS[last.status];
};

const contains = (span: { readonly from: number; readonly to: number }, at: number): boolean =>
  span.from <= at && at <= span.to;

/**
 * Fold the events into the run's story. Each ref has one owner, the first to
 * produce it: a worker for its own events, else the lead step whose interval
 * holds the event, else the loose lane under the playbook.
 */
const buildStory = (
  events: ReadonlyArray<TraceEvent>,
  intervals: ReadonlyArray<Interval>,
  runStart: TraceEvent | undefined,
): Story => {
  const inputs = (runStart?.refs ?? []).filter(isIssue);
  const loose = { workers: new Array<StoryWorker>(), outputs: new Array<StoryOutput>() };
  const steps = intervals
    .filter(
      (interval) => interval.family === 'phase' && interval.lane === 'lead' && interval.depth === 0,
    )
    .map((phase) => {
      const attrs = { ...phase.end?.attrs, ...phase.start.attrs };
      return {
        id: phase.id,
        label: phase.label,
        via: nonEmpty(attrs['skill']) ?? nonEmpty(attrs['playbook']),
        from: phase.from,
        to: phase.to,
        open: phase.open,
        status: phase.status,
        workers: new Array<StoryWorker>(),
        outputs: new Array<StoryOutput>(),
      };
    });
  const laneAt = (at: number) => steps.find((step) => contains(step, at)) ?? loose;

  const byEvent = new Map<TraceEvent, StoryWorker & { outputs: Array<StoryOutput> }>();
  const workers = intervals
    .filter((interval) => interval.family === 'worker')
    .map((interval) => {
      const attrs = { ...interval.start.attrs, ...interval.end?.attrs };
      const worker = {
        id: interval.id,
        task: interval.label,
        playbook: nonEmpty(attrs['playbook']),
        via: nonEmpty(attrs['skill']),
        model: modelOf(attrs),
        from: interval.from,
        to: interval.to,
        open: interval.open,
        status: interval.status,
        inputs: interval.start.refs.filter(isIssue),
        outputs: new Array<StoryOutput>(),
      };
      byEvent.set(interval.start, worker);
      if (interval.end !== undefined) byEvent.set(interval.end, worker);
      const named = steps.filter((step) => step.id === interval.start.attrs['phase']);
      const lane =
        named.find((step) => contains(step, interval.from)) ?? named[0] ?? laneAt(interval.from);
      lane.workers.push(worker);
      return worker;
    });
  const workerOf = (actor: string, at: number) => {
    const same = workers.filter((worker) => worker.id === actor);
    return same.findLast((worker) => worker.from <= at) ?? same[0];
  };

  const owned = new Set<string>();
  const links: Array<StoryLink> = [];
  for (const event of events) {
    const owner = byEvent.get(event) ?? workerOf(event.actor, event.at) ?? laneAt(event.at);
    const skip = new Set([...inputs, ...('inputs' in owner ? owner.inputs : [])]);
    const fail = event.status === 'fail';
    const take = (ref: string, note: string) => {
      if (owned.has(ref) || skip.has(ref)) return;
      owned.add(ref);
      const ci = refType(ref) === 'pr' ? ciNote(ref, intervals) : undefined;
      owner.outputs.push({ ref, note: ci ?? note, fail });
    };
    if (event.kind === 'link') {
      const [head, ...tail] = event.refs;
      if (head === undefined) continue;
      for (const ref of tail) {
        if (!owned.has(ref)) take(ref, event.summary);
        else if (
          owned.has(head) &&
          ref !== head &&
          !links.some((link) => link.from === head && link.to === ref)
        ) {
          links.push({ from: head, to: ref, label: event.summary, fail });
        }
      }
    } else if (event.kind === 'worker.start') {
      for (const ref of event.refs) if (!isIssue(ref)) take(ref, '');
    } else if (
      event.kind === 'worker.end' ||
      event.kind === 'phase.end' ||
      event.kind === 'run.end'
    ) {
      for (const ref of event.refs) take(ref, event.summary);
    }
  }

  return {
    playbook: nonEmpty(runStart?.attrs['playbook']),
    goal: runStart?.summary ?? '',
    inputs,
    loose,
    steps,
    links,
  };
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
      model: modelOf(attrs),
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
      outputs: (interval.end?.refs ?? []).filter((ref) => RESULT_TYPES.has(refType(ref))),
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
    story: buildStory(events, intervals, runStart),
    kpis,
    leadCalls,
    busy,
    serial,
    peak,
    problems: problems.toSorted((a, b) => a.line - b.line),
  };
};
