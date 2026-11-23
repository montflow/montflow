import * as Fs from 'node:fs';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { buildModel, parseTrace } from '../index.js';

const EXAMPLE = NodePath.resolve(
  import.meta.dirname,
  '../../../../skills/mf-mode-observe/references/example.trace.jsonl',
);

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

Vitest.describe('trace', () => {
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

  Vitest.it('reads the shipped example: three workers, CI, three PRs', () => {
    const model = buildModel(parseTrace(Fs.readFileSync(EXAMPLE, 'utf8')));
    Vitest.expect(model.problems).toEqual([]);
    Vitest.expect(model.lanes.map((lane) => lane.id)).toEqual(['lead', 'w23', 'w24', 'w25', 'ci']);
    Vitest.expect(model.workers.map((w) => [w.id, w.outputs])).toEqual([
      ['w23', ['pr:#55']],
      ['w24', ['pr:#57']],
      ['w25', ['pr:#56']],
    ]);
    Vitest.expect(model.leadCalls).toBe(33);
    Vitest.expect(
      model.nodes
        .filter((node) => node.type === 'pr')
        .map((node) => node.id)
        .toSorted(),
    ).toEqual(['pr:#55', 'pr:#56', 'pr:#57']);
  });
});
