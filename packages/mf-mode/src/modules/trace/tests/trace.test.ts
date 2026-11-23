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

/** A lead step routed to a skill, one that runs another playbook and opens a PR itself, and a late worker sent back to a named step. */
const ROUTED = [
  '{"v":1,"ts":"2026-01-01T10:00:00Z","actor":"lead","kind":"run.start","summary":"Add the widget","refs":["issue:#7"],"attrs":{"playbook":"feature"}}',
  '{"v":1,"ts":"2026-01-01T10:01:00Z","actor":"lead","kind":"phase.start","summary":"Pick a design","span":"design","attrs":{"skill":"mf-mode-arena"}}',
  '{"v":1,"ts":"2026-01-01T10:01:00Z","actor":"lead","kind":"worker.start","summary":"Runner A","span":"r1","refs":["issue:#7","branch:proto/a"],"attrs":{"playbook":"prototype","skill":"mf-mode-arena"}}',
  '{"v":1,"ts":"2026-01-01T10:05:00Z","actor":"lead","kind":"worker.end","summary":"Prototype ready","span":"r1","status":"ok","refs":["branch:proto/a","issue:#7"]}',
  '{"v":1,"ts":"2026-01-01T10:06:00Z","actor":"lead","kind":"phase.end","summary":"Pick a design","span":"design","status":"ok"}',
  '{"v":1,"ts":"2026-01-01T10:07:00Z","actor":"lead","kind":"phase.start","summary":"Open the PR","span":"ship","attrs":{"playbook":"opening-a-pr"}}',
  '{"v":1,"ts":"2026-01-01T10:08:00Z","actor":"lead","kind":"ci.start","summary":"Verify","span":"ci-9","refs":["pr:#9"]}',
  '{"v":1,"ts":"2026-01-01T10:09:00Z","actor":"lead","kind":"phase.end","summary":"Open the PR","span":"ship","status":"ok","refs":["pr:#9","commit:abc1234"]}',
  '{"v":1,"ts":"2026-01-01T10:10:00Z","actor":"lead","kind":"ci.end","summary":"Verify failed","span":"ci-9","status":"fail","refs":["pr:#9"]}',
  '{"v":1,"ts":"2026-01-01T10:11:00Z","actor":"lead","kind":"worker.start","summary":"Fix the design","span":"fix","attrs":{"phase":"design"}}',
  '{"v":1,"ts":"2026-01-01T10:12:00Z","actor":"fix","kind":"phase.end","summary":"Fixed","span":"edit","status":"ok","refs":["commit:def5678","pr:#9"]}',
  '{"v":1,"ts":"2026-01-01T10:13:00Z","actor":"lead","kind":"run.end","summary":"PR open","status":"ok","refs":["pr:#9"]}',
].join('\n');

/** An older trace: workers but no phases, and `phase` lines the parser rejects. */
const OLD = [
  '{"v":1,"ts":"2026-01-01T10:00:00Z","actor":"lead","kind":"run.start","summary":"Start sessions","attrs":{"playbook":"autopilot-stack"}}',
  '{"v":1,"ts":"2026-01-01T10:01:00Z","actor":"lead","kind":"worker.start","summary":"#61 session","span":"w61","refs":["issue:#61","branch:chore/x"],"attrs":{"playbook":"refactoring"}}',
  '{"v":1,"ts":"2026-01-01T10:02:00Z","actor":"w61","kind":"phase","summary":"start: read the issue"}',
  '{"v":1,"ts":"2026-01-01T10:03:00Z","actor":"lead","kind":"note","summary":"Told #61 to attach its report","refs":["pr:#68"]}',
  '{"v":1,"ts":"2026-01-01T10:04:00Z","actor":"lead","kind":"run.end","summary":"Sessions running","status":"ok"}',
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
  });

  Vitest.it(
    'tells the story: each worker under the step it started in, with what it produced',
    () => {
      const { story } = buildModel(parseTrace(HAND));
      Vitest.expect(story).toMatchObject({
        playbook: undefined,
        goal: 'Ship the thing',
        loose: {
          outputs: [],
          workers: [{ id: 'b', status: 'fail', outputs: [{ ref: 'pr:#11', fail: true }] }],
        },
        steps: [
          {
            id: 'plan',
            label: 'Plan',
            status: 'ok',
            workers: [
              {
                id: 'a',
                task: 'Task A',
                model: 'opus',
                inputs: ['issue:#1'],
                outputs: [{ ref: 'pr:#10', note: 'PR open', fail: false }],
              },
            ],
          },
          { id: 'watch', open: true, workers: [], outputs: [] },
        ],
        links: [{ from: 'pr:#10', to: 'pr:#11', label: 'stacked on', fail: false }],
      });
    },
  );

  Vitest.it(
    'names the routed skill or playbook of a step, and what the lead itself produced',
    () => {
      const { story } = buildModel(parseTrace(ROUTED));
      Vitest.expect(story.playbook).toBe('feature');
      Vitest.expect(story.inputs).toEqual(['issue:#7']);
      Vitest.expect(story.loose).toEqual({ workers: [], outputs: [] });
      Vitest.expect(story.steps).toMatchObject([
        {
          id: 'design',
          via: 'mf-mode-arena',
          outputs: [],
          workers: [
            {
              id: 'r1',
              playbook: 'prototype',
              via: 'mf-mode-arena',
              outputs: [{ ref: 'branch:proto/a', note: '', fail: false }],
            },
            { id: 'fix', outputs: [{ ref: 'commit:def5678', note: 'Fixed' }] },
          ],
        },
        {
          id: 'ship',
          via: 'opening-a-pr',
          workers: [],
          outputs: [
            { ref: 'pr:#9', note: 'CI failed', fail: false },
            { ref: 'commit:abc1234', note: 'Open the PR', fail: false },
          ],
        },
      ]);
    },
  );

  Vitest.it('still tells a story for a trace with no phases and old-style lines', () => {
    const model = buildModel(parseTrace(OLD));
    Vitest.expect(model.problems.map((problem) => problem.message)).toContain(
      "unknown kind 'phase'",
    );
    Vitest.expect(model.story).toMatchObject({
      playbook: 'autopilot-stack',
      steps: [],
      loose: {
        outputs: [],
        workers: [
          { id: 'w61', playbook: 'refactoring', open: true, outputs: [{ ref: 'branch:chore/x' }] },
        ],
      },
      links: [],
    });
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
    const { story } = model;
    Vitest.expect(story.playbook).toBe('feature');
    Vitest.expect(story.steps.map((step) => step.id)).toEqual([
      'investigate',
      'spawn-23',
      'watch-23',
      'spawn-24-25',
      'watch',
      'verify',
    ]);
    const step = (id: string) => story.steps.find((s) => s.id === id);
    Vitest.expect(step('spawn-23')?.workers).toMatchObject([
      {
        id: 'w23',
        outputs: [
          { ref: 'branch:feat/provider-integration' },
          { ref: 'pr:#55', note: 'CI passed', fail: false },
        ],
      },
    ]);
    Vitest.expect(step('spawn-24-25')?.workers.map((w) => w.id)).toEqual(['w24', 'w25']);
    Vitest.expect(step('spawn-24-25')?.workers[1]?.outputs).toEqual([
      { ref: 'branch:feat/provider-gaps', note: '', fail: false },
      { ref: 'issue:#34', note: 'no provider delete', fail: true },
      { ref: 'pr:#56', note: 'CI passed', fail: false },
    ]);
    Vitest.expect(story.links).toEqual([
      { from: 'pr:#55', to: 'pr:#56', label: 'stacked on', fail: false },
      { from: 'pr:#55', to: 'pr:#57', label: 'stacked on', fail: false },
    ]);
  });
});
