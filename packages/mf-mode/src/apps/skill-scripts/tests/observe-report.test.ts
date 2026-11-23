import { spawn, spawnSync } from 'node:child_process';
import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import {
  buildModel,
  KINDS,
  main,
  parseTrace,
  renderReport,
} from '../../../../skills/mf-mode-report/scripts/report.ts';

const SKILLS = NodePath.resolve(import.meta.dirname, '../../../../skills');
const EMIT = NodePath.join(SKILLS, 'mf-mode-observe/scripts/emit.sh');
const REPORT = NodePath.join(SKILLS, 'mf-mode-report/scripts/report.ts');
const EXAMPLE = NodePath.join(SKILLS, 'mf-mode-observe/references/example.trace.jsonl');

const scratch = (): string => Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-mode-observe-'));

const emit = (args: ReadonlyArray<string>) => {
  const result = spawnSync('bash', [EMIT, ...args], { encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr };
};

const lines = (path: string): ReadonlyArray<string> =>
  Fs.readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line !== '');

const silent = () => {
  const out: Array<string> = [];
  const err: Array<string> = [];
  return {
    out,
    err,
    io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) },
  };
};

/** A trace written by hand: two overlapping workers, one open phase, one bad line. */
const HAND = [
  '{"v":1,"ts":"2026-01-01T10:00:00Z","actor":"lead","kind":"run.start","summary":"Ship the thing"}',
  '{"v":1,"ts":"2026-01-01T10:00:00Z","actor":"lead","kind":"phase.start","summary":"Plan","span":"plan"}',
  '{"v":1,"ts":"2026-01-01T10:00:00Z","actor":"lead","kind":"worker.start","summary":"Task A","span":"a","refs":["issue:#1"],"attrs":{"model":"opus"}}',
  '{"v":1,"ts":"2026-01-01T10:02:00Z","actor":"lead","kind":"phase.end","summary":"Plan","span":"plan","status":"ok","calls":4}',
  '{"v":1,"ts":"2026-01-01T10:03:00Z","actor":"a","kind":"friction","summary":"Flaky CLI","secs":30,"calls":2,"note":"pin it"}',
  'this line is not json',
  '{"v":1,"ts":"2026-01-01T10:05:00Z","actor":"lead","kind":"worker.start","summary":"Task B","span":"b","refs":["issue:#2"]}',
  '{"v":1,"ts":"2026-01-01T10:06:00Z","actor":"lead","kind":"phase.start","summary":"Watch","span":"watch"}',
  '{"v":1,"ts":"2026-01-01T10:08:00Z","actor":"a","kind":"check","summary":"tests","status":"fail"}',
  '{"v":1,"ts":"2026-01-01T10:09:00Z","actor":"a","kind":"check","summary":"tests again","status":"ok"}',
  '{"v":1,"ts":"2026-01-01T10:10:00Z","actor":"lead","kind":"worker.end","summary":"PR open","span":"a","status":"ok","refs":["pr:#10"],"calls":17}',
  '{"v":1,"ts":"2026-01-01T10:12:00Z","actor":"lead","kind":"friction","summary":"Prompt stalled","secs":15}',
  '{"v":1,"ts":"2026-01-01T10:20:00Z","actor":"lead","kind":"worker.end","summary":"PR open","span":"b","status":"fail","refs":["pr:#11"]}',
  '{"v":1,"ts":"2026-01-01T10:20:00Z","actor":"lead","kind":"link","summary":"stacked on","refs":["pr:#10","pr:#11"]}',
].join('\n');

Vitest.describe('mf-mode-observe emit.sh', () => {
  Vitest.it('appends one parseable event per call, fields intact', () => {
    const dir = scratch();
    try {
      const trace = NodePath.join(dir, 'nested', 'trace.jsonl');
      const summary = 'quote " backslash \\ newline\nand tab\there, <b>&';
      const run = emit([
        trace,
        'check',
        summary,
        '--actor',
        'w1',
        '--status',
        'fail',
        '--ref',
        'pr:#55',
        '--ref',
        'file:a.ts:3',
        '--calls',
        '2',
        '--secs',
        '1.5',
        '--note',
        'bun run test',
        '--attr',
        'model=opus',
        '--ts',
        '2026-11-23T14:35:41Z',
      ]);
      Vitest.expect(run).toEqual({ status: 0, stderr: '' });
      const [line] = lines(trace);
      Vitest.expect(JSON.parse(line ?? '')).toEqual({
        v: 1,
        ts: '2026-11-23T14:35:41Z',
        actor: 'w1',
        kind: 'check',
        summary,
        status: 'fail',
        calls: 2,
        secs: 1.5,
        note: 'bun run test',
        refs: ['pr:#55', 'file:a.ts:3'],
        attrs: { model: 'opus' },
      });
      const parsed = parseTrace(Fs.readFileSync(trace, 'utf8'));
      Vitest.expect(parsed.problems).toEqual([]);
      Vitest.expect(parsed.events[0]).toMatchObject({
        actor: 'w1',
        kind: 'check',
        summary,
        status: 'fail',
      });
    } finally {
      Fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  Vitest.it('accepts every kind the report reads, and keeps an unknown one with a warning', () => {
    const dir = scratch();
    try {
      const trace = NodePath.join(dir, 'trace.jsonl');
      for (const kind of KINDS)
        Vitest.expect(emit([trace, kind, kind])).toEqual({ status: 0, stderr: '' });
      const unknown = emit([trace, 'phase.begin', 'typo']);
      Vitest.expect(unknown.status).toBe(0);
      Vitest.expect(unknown.stderr).toContain("unknown kind 'phase.begin'");
      Vitest.expect(lines(trace)).toHaveLength(KINDS.length + 1);
      const parsed = parseTrace(Fs.readFileSync(trace, 'utf8'));
      Vitest.expect(parsed.events.map((event) => event.kind)).toEqual([...KINDS]);
      Vitest.expect(parsed.problems).toEqual([
        { line: KINDS.length + 1, message: "unknown kind 'phase.begin'" },
      ]);
    } finally {
      Fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  Vitest.it(
    'never fails the caller: bad input and an unwritable trace exit 0 with a warning',
    () => {
      const dir = scratch();
      try {
        const usage = emit([]);
        Vitest.expect(usage.status).toBe(0);
        Vitest.expect(usage.stderr).toContain('usage: emit.sh');
        const unwritable = emit([dir, 'note', 'the trace path is a directory']);
        Vitest.expect(unwritable.status).toBe(0);
        Vitest.expect(unwritable.stderr).toContain('could not append');
        const trace = NodePath.join(dir, 'trace.jsonl');
        const sloppy = emit([
          trace,
          'check',
          'x',
          '--status',
          'maybe',
          '--calls',
          'lots',
          '--attr',
          'no value',
        ]);
        Vitest.expect(sloppy.status).toBe(0);
        Vitest.expect(sloppy.stderr.split('\n').filter(Boolean)).toHaveLength(3);
        Vitest.expect(JSON.parse(lines(trace)[0] ?? '')).not.toHaveProperty('status');
      } finally {
        Fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  Vitest.it('keeps whole lines when many workers append at once', async () => {
    const dir = scratch();
    try {
      const trace = NodePath.join(dir, 'trace.jsonl');
      const writers = 24;
      const long = 'x'.repeat(380);
      await Promise.all(
        Array.from(
          { length: writers },
          (_, index) =>
            new Promise<void>((done, fail) => {
              const child = spawn('bash', [
                EMIT,
                trace,
                'note',
                'writer ' + index + ' ' + long,
                '--actor',
                'w' + index,
              ]);
              child.on('error', fail);
              child.on('exit', () => done());
            }),
        ),
      );
      const parsed = parseTrace(Fs.readFileSync(trace, 'utf8'));
      Vitest.expect(parsed.problems).toEqual([]);
      Vitest.expect(new Set(parsed.events.map((event) => event.actor)).size).toBe(writers);
    } finally {
      Fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

Vitest.describe('mf-mode-report report.ts', () => {
  Vitest.it('derives the run numbers from the events', () => {
    const model = buildModel(parseTrace(HAND));
    const minute = 60_000;
    Vitest.expect(model.busy).toBe(20 * minute);
    Vitest.expect(model.serial).toBe(25 * minute);
    Vitest.expect(model.peak).toBe(2);
    Vitest.expect(model.leadCalls).toBe(4);
    Vitest.expect(model.lanes.map((lane) => lane.id)).toEqual(['lead', 'a', 'b']);
    Vitest.expect(model.workers).toMatchObject([
      {
        id: 'a',
        model: 'opus',
        calls: 17,
        checksOk: 1,
        checksFail: 1,
        friction: 1,
        frictionSecs: 30,
        status: 'ok',
        outputs: ['pr:#10'],
      },
      { id: 'b', calls: undefined, status: 'fail', outputs: ['pr:#11'] },
    ]);
    Vitest.expect(model.problems).toEqual([
      { line: 6, message: 'not valid JSON' },
      { line: 8, message: 'phase.start never ended (watch), drawn to the last event' },
    ]);
    const kpi = Object.fromEntries(model.kpis.map((k) => [k.label, k.value]));
    Vitest.expect(kpi).toMatchObject({
      'Wall clock': '20m 00s',
      Workers: '2',
      Friction: '45s',
      'Pull requests': '2',
    });
    Vitest.expect(model.edges).toEqual(
      Vitest.expect.arrayContaining([
        Vitest.expect.objectContaining({ from: 'issue:#1', to: 'worker:a' }),
        Vitest.expect.objectContaining({ from: 'worker:a', to: 'pr:#10' }),
        Vitest.expect.objectContaining({ from: 'worker:b', to: 'pr:#11', fail: true }),
        Vitest.expect.objectContaining({ from: 'pr:#10', to: 'pr:#11', label: 'stacked on' }),
      ]),
    );
    const layer = (id: string) => model.nodes.find((node) => node.id === id)?.layer;
    Vitest.expect(layer('pr:#11')).toBe(layer('pr:#10'));
  });

  Vitest.it('renders a self-contained page with both themes, every lane and escaped text', () => {
    const trace =
      HAND +
      '\n{"v":1,"ts":"2026-01-01T10:20:00Z","actor":"lead","kind":"note","summary":"<script>alert(1)</script>"}';
    const html = renderReport(buildModel(parseTrace(trace)), 'trace.jsonl');
    Vitest.expect(html).not.toMatch(/<(link|img|iframe)\b|\ssrc=|@import|url\((?!#)|https?:\/\//i);
    Vitest.expect(html).toContain('prefers-color-scheme:dark');
    Vitest.expect(html).not.toContain('<script>alert');
    Vitest.expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    for (const lane of ['lead', 'a', 'b']) Vitest.expect(html).toContain('>' + lane + '</text>');
    for (const heading of ['Timeline', 'Paths', 'Workers', 'Friction', 'Checks', 'Trace health']) {
      Vitest.expect(html).toContain('<h2>' + heading + '</h2>');
    }
  });

  Vitest.it('renders the shipped example: three workers, CI, three PRs', () => {
    const model = buildModel(parseTrace(Fs.readFileSync(EXAMPLE, 'utf8')));
    Vitest.expect(model.problems).toEqual([]);
    Vitest.expect(model.lanes.map((lane) => lane.id)).toEqual(['lead', 'w23', 'w24', 'w25', 'ci']);
    Vitest.expect(model.workers.map((w) => [w.id, w.outputs])).toEqual([
      ['w23', ['pr:#55']],
      ['w24', ['pr:#57']],
      ['w25', ['pr:#56']],
    ]);
    Vitest.expect(model.leadCalls).toBe(33);
    const html = renderReport(model, 'example.trace.jsonl');
    for (const pr of ['PR #55', 'PR #56', 'PR #57']) Vitest.expect(html).toContain(pr);
  });

  Vitest.it(
    'CLI: writes next to the trace, prints the path, and exits non-zero with nothing to render',
    () => {
      const dir = scratch();
      try {
        const trace = NodePath.join(dir, 'run.jsonl');
        Fs.writeFileSync(trace, HAND);
        const ok = silent();
        Vitest.expect(main([trace], ok.io)).toBe(0);
        const target = NodePath.join(dir, 'run.report.html');
        Vitest.expect(ok.out).toEqual([target]);
        Vitest.expect(Fs.readFileSync(target, 'utf8')).toContain('<h1>Ship the thing</h1>');
        Vitest.expect(ok.err.join('')).toContain('2 trace problems');

        const empty = NodePath.join(dir, 'empty.jsonl');
        Fs.writeFileSync(empty, 'nope\n');
        Vitest.expect(main([empty], silent().io)).toBe(1);
        Vitest.expect(main([NodePath.join(dir, 'missing.jsonl')], silent().io)).toBe(1);
        Vitest.expect(main([], silent().io)).toBe(2);
      } finally {
        Fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  Vitest.it(
    'runs the way the skill runs it: bun on the script file',
    () => {
      const dir = scratch();
      try {
        const out = NodePath.join(dir, 'report.html');
        const result = spawnSync('bun', [REPORT, EXAMPLE, '--out', out, '--title', 'Example run'], {
          encoding: 'utf8',
        });
        Vitest.expect(result.status).toBe(0);
        Vitest.expect(result.stdout.trim()).toBe(out);
        Vitest.expect(Fs.readFileSync(out, 'utf8')).toContain('<h1>Example run</h1>');
      } finally {
        Fs.rmSync(dir, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
