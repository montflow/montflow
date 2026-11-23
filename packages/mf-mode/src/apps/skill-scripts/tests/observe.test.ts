import { spawn, spawnSync } from 'node:child_process';
import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { KINDS, parseTrace } from '../../../modules/trace/index.js';

const SKILLS = NodePath.resolve(import.meta.dirname, '../../../../skills');
const EMIT = NodePath.join(SKILLS, 'mf-mode-observe/scripts/emit.sh');

const scratch = (): string => Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-mode-observe-'));

const emit = (args: ReadonlyArray<string>) => {
  const result = spawnSync('bash', [EMIT, ...args], { encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr };
};

const lines = (path: string): ReadonlyArray<string> =>
  Fs.readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line !== '');

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
