import { NodeServices } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { Deferred, Effect, Fiber, FileSystem } from 'effect';

import {
  DEFAULT_GATE_CONFIG,
  type GateConfig,
  type ScheduleOutcome,
  GateWaitTimeout,
  type RunState,
  SchedulerWriteError,
  fingerprintScopes,
  gateKey,
  laneOf,
  listRunStates,
  parseGateConfig,
  pruneRunStates,
  scheduleRun,
  writeRunState,
} from '../index.js';
import { latestResults, parseGateResults, verifyGateResults } from '../../gates/index.js';

const Live = NodeServices.layer;

const workspace = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped({ prefix: 'mf-scheduler-' });
});

/** Append one record line and return its index, the way `gate run` does. */
const persistTo =
  (dir: string, relative = 'results.jsonl') =>
  (outcome: ScheduleOutcome) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = `${dir}/${relative}`;
      const existing = yield* fs.readFileString(path).pipe(Effect.orElseSucceed(() => ''));
      const index = existing.split('\n').filter((line) => line.trim() !== '').length;
      const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
      yield* fs.writeFileString(path, `${separator}${JSON.stringify(outcome)}\n`, { flag: 'a' });
      return index;
    });

/** Append one mechanical `GATE-RESULTS.jsonl` record for stage 0, the way `gate run` does. */
const persistStage =
  (dir: string, session: string, relative = 'results.jsonl') =>
  (outcome: ScheduleOutcome) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = `${dir}/${relative}`;
      const existing = yield* fs.readFileString(path).pipe(Effect.orElseSucceed(() => ''));
      const index = existing.split('\n').filter((line) => line.trim() !== '').length;
      const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
      const record = {
        stage: 0,
        title: 'Static',
        kind: 'mechanical',
        command: 'printf ok',
        scope: ['repo'],
        owner: session,
        exit: outcome.exit,
        verdict: outcome.exit === 0 ? 'pass' : 'fail',
        at: outcome.at,
        durationMs: outcome.durationMs,
        reused: outcome.reused,
        output: outcome.output,
      };
      yield* fs.writeFileString(path, `${separator}${JSON.stringify(record)}\n`, { flag: 'a' });
      return index;
    });

const request = (
  dir: string,
  overrides: {
    readonly key?: string;
    readonly fingerprint?: string;
    readonly lane?: 'heavy' | 'light';
    readonly config?: GateConfig;
    readonly session?: string;
    readonly reuse?: boolean;
    readonly waitTimeoutSeconds?: number;
    readonly resultPath?: string;
  } = {},
) => ({
  workspace: dir,
  key: overrides.key ?? 'gate-v1:test',
  command: 'printf ok',
  scope: ['repo'],
  fingerprint: overrides.fingerprint ?? 'fp-1',
  lane: overrides.lane ?? ('heavy' as const),
  config: overrides.config ?? DEFAULT_GATE_CONFIG,
  owner: { session: overrides.session ?? 's1', task: 'A001', pid: process.pid },
  reuse: overrides.reuse ?? true,
  resultPath: overrides.resultPath ?? 'results.jsonl',
  pollMs: 10,
  waitTimeoutSeconds: overrides.waitTimeoutSeconds,
});

const ok = (output = 'ok') => Effect.succeed({ exit: 0, output, timedOut: false });

Vitest.describe('Scheduler key and config', () => {
  Vitest.it('builds a stable gate-v1 key over command, scope, and fingerprint', () => {
    const left = gateKey('bun   test', ['repo'], 'fp');
    Vitest.expect(left.startsWith('gate-v1:')).toBe(true);
    Vitest.expect(gateKey(' bun test ', ['.'], 'fp')).toBe(left);
    Vitest.expect(gateKey('bun test', ['repo'], 'other')).not.toBe(left);
    Vitest.expect(gateKey('bun lint', ['repo'], 'fp')).not.toBe(left);
  });

  Vitest.it('reads gate.json defaults and refuses a bound below 1', () => {
    const defaults = parseGateConfig(undefined);
    Vitest.expect(defaults.problems).toStrictEqual([]);
    Vitest.expect(defaults.config).toStrictEqual(DEFAULT_GATE_CONFIG);

    const overridden = parseGateConfig(
      JSON.stringify({ heavy: { lanes: 3, inFlight: 4 }, leaseSeconds: 30, heartbeatSeconds: 5 }),
    );
    Vitest.expect(overridden.problems).toStrictEqual([]);
    Vitest.expect(overridden.config.heavy).toStrictEqual({ lanes: 3, inFlight: 4 });
    Vitest.expect(overridden.config.leaseSeconds).toBe(30);
    Vitest.expect(overridden.config.heartbeatSeconds).toBe(5);

    const bad = parseGateConfig(JSON.stringify({ heavy: { lanes: 0 } }));
    Vitest.expect(bad.problems).toHaveLength(1);
    Vitest.expect(bad.problems[0]).toContain('heavy.lanes');

    const slowHeartbeat = parseGateConfig(
      JSON.stringify({ leaseSeconds: 5, heartbeatSeconds: 10 }),
    );
    Vitest.expect(slowHeartbeat.problems).toHaveLength(1);
    Vitest.expect(slowHeartbeat.problems[0]).toContain('heartbeatSeconds');

    Vitest.expect(parseGateConfig('{nope').problems).toHaveLength(1);
  });

  Vitest.it('classifies heavy work and defaults an explicit lane over the heuristic', () => {
    Vitest.expect(laneOf('bun run test')).toBe('heavy');
    Vitest.expect(laneOf('tsc --noEmit')).toBe('heavy');
    Vitest.expect(laneOf('oxlint .')).toBe('heavy');
    Vitest.expect(laneOf('printf ok')).toBe('light');
    Vitest.expect(laneOf('bun run test', 'light')).toBe('light');
  });

  Vitest.it.live(
    'fingerprints files, skips results and the runtime tree, and scopes to a path',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* workspace;
        yield* fs.makeDirectory(`${dir}/app`, { recursive: true });
        yield* fs.writeFileString(`${dir}/app/a.txt`, 'one');
        yield* fs.writeFileString(`${dir}/app/GATE-RESULTS.jsonl`, '{"stage":0}\n');
        yield* fs.makeDirectory(`${dir}/.agents/@montflow/.runtime/runs`, { recursive: true });
        yield* fs.writeFileString(`${dir}/.agents/@montflow/.runtime/runs/x.json`, '{}');
        yield* fs.makeDirectory(`${dir}/node_modules/dep`, { recursive: true });
        yield* fs.writeFileString(`${dir}/node_modules/dep/b.txt`, 'two');

        const scoped = yield* fingerprintScopes(dir, ['app']);
        Vitest.expect(scoped.files).toBe(1);
        Vitest.expect(scoped.missing).toStrictEqual([]);

        yield* fs.writeFileString(`${dir}/app/GATE-RESULTS.jsonl`, '{"stage":1}\n');
        const afterRecord = yield* fingerprintScopes(dir, ['app']);
        Vitest.expect(afterRecord.fingerprint).toBe(scoped.fingerprint);

        yield* fs.writeFileString(`${dir}/app/a.txt`, 'changed');
        const changed = yield* fingerprintScopes(dir, ['app']);
        Vitest.expect(changed.fingerprint).not.toBe(scoped.fingerprint);

        const missing = yield* fingerprintScopes(dir, ['nope']);
        Vitest.expect(missing.missing).toStrictEqual(['nope']);
      }).pipe(Effect.provide(Live), Effect.scoped),
  );
});

Vitest.describe('Scheduler single flight', () => {
  Vitest.it.live('one key runs once for two concurrent requesters', () =>
    Effect.gen(function* () {
      const dir = yield* workspace;
      let executions = 0;
      const execute = Effect.suspend(() => {
        executions += 1;
        return Effect.sleep(80).pipe(Effect.as({ exit: 0, output: 'ok', timedOut: false }));
      });
      const [first, second] = yield* Effect.all(
        [
          scheduleRun(request(dir, { session: 's1' }), execute, persistTo(dir)),
          scheduleRun(request(dir, { session: 's2' }), execute, persistTo(dir)),
        ],
        { concurrency: 'unbounded' },
      );
      Vitest.expect(executions).toBe(1);
      Vitest.expect([first.state, second.state].toSorted()).toStrictEqual(['passed', 'passed']);
      Vitest.expect([first.reused, second.reused].toSorted()).toStrictEqual([false, true]);
      Vitest.expect(first.reused ? first.source : second.source).toBeDefined();
      const fs = yield* FileSystem.FileSystem;
      const records = (yield* fs.readFileString(`${dir}/results.jsonl`))
        .split('\n')
        .filter((line) => line.trim() !== '');
      Vitest.expect(records).toHaveLength(2);
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('reuses a matching pass and reruns when the fingerprint changes', () =>
    Effect.gen(function* () {
      const dir = yield* workspace;
      let executions = 0;
      const execute = Effect.suspend(() => {
        executions += 1;
        return ok();
      });
      const first = yield* scheduleRun(request(dir), execute, persistTo(dir));
      const second = yield* scheduleRun(request(dir, { session: 's2' }), execute, persistTo(dir));
      Vitest.expect(first.reused).toBe(false);
      Vitest.expect(second.reused).toBe(true);
      Vitest.expect(second.source).toBeDefined();
      Vitest.expect(executions).toBe(1);

      const changed = yield* scheduleRun(
        request(dir, { fingerprint: 'fp-2', key: 'gate-v1:changed' }),
        execute,
        persistTo(dir),
      );
      Vitest.expect(changed.reused).toBe(false);
      Vitest.expect(executions).toBe(2);
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('never reuses a failure as a pass and sets --no-reuse to rerun', () =>
    Effect.gen(function* () {
      const dir = yield* workspace;
      let executions = 0;
      const failing = Effect.suspend(() => {
        executions += 1;
        return Effect.succeed({ exit: 2, output: 'nope', timedOut: false });
      });
      const first = yield* scheduleRun(request(dir), failing, persistTo(dir));
      const second = yield* scheduleRun(request(dir, { session: 's2' }), failing, persistTo(dir));
      Vitest.expect(first.state).toBe('failed');
      Vitest.expect(second.state).toBe('failed');
      Vitest.expect(second.reused).toBe(false);
      Vitest.expect(executions).toBe(2);

      const passing = Effect.suspend(() => {
        executions += 1;
        return ok();
      });
      yield* scheduleRun(request(dir, { key: 'gate-v1:pass' }), passing, persistTo(dir));
      const forced = yield* scheduleRun(
        request(dir, { key: 'gate-v1:pass', session: 's3', reuse: false }),
        passing,
        persistTo(dir),
      );
      Vitest.expect(forced.reused).toBe(false);
      Vitest.expect(executions).toBe(4);
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('reclaims an expired lease and records a timeout as no pass', () =>
    Effect.gen(function* () {
      const dir = yield* workspace;
      const past = '2026-01-01T00:00:00Z';
      const key = 'gate-v1:leased';
      const state: RunState = {
        version: 1,
        key,
        command: 'printf ok',
        scope: ['repo'],
        fingerprint: 'fp-1',
        state: 'running',
        lane: 'heavy',
        attempts: [
          {
            owner: { session: 'gone', task: 'A001', pid: 999_999 },
            startedAt: past,
            heartbeatAt: past,
            leaseExpiresAt: past,
          },
        ],
        waiters: [],
        resultPath: 'results.jsonl',
      };
      yield* writeRunState(dir, state);
      let executions = 0;
      const execute = Effect.suspend(() => {
        executions += 1;
        return ok();
      });
      const reclaimed = yield* scheduleRun(request(dir, { key }), execute, persistTo(dir));
      Vitest.expect(reclaimed.reclaimed).toBe(true);
      Vitest.expect(reclaimed.attempt).toBe(2);
      Vitest.expect(reclaimed.state).toBe('passed');

      const timedOut = yield* scheduleRun(
        request(dir, { key: 'gate-v1:slow' }),
        Effect.succeed({ exit: 124, output: 'Timed out', timedOut: true }),
        persistTo(dir),
      );
      Vitest.expect(timedOut.state).toBe('timeout');
      Vitest.expect(timedOut.exit).toBe(124);
    }).pipe(Effect.provide(Live), Effect.scoped),
  );
});

Vitest.describe('Scheduler bounds', () => {
  const twoLanes: GateConfig = { ...DEFAULT_GATE_CONFIG, heavy: { lanes: 2, inFlight: 2 } };

  Vitest.it.live('bounds the heavy lane to one and honors an override', () =>
    Effect.gen(function* () {
      const dir = yield* workspace;
      const slow = Effect.sleep(120).pipe(Effect.as({ exit: 0, output: 'a', timedOut: false }));
      const fast = ok('b');
      const runPair = (config: GateConfig) =>
        Effect.gen(function* () {
          const fiber = yield* scheduleRun(
            request(dir, { key: 'gate-v1:a', config, session: 's1' }),
            slow,
            persistTo(dir, 'a.jsonl'),
          ).pipe(Effect.forkChild);
          yield* Effect.sleep(20);
          const second = yield* scheduleRun(
            request(dir, { key: 'gate-v1:b', config, session: 's2' }),
            fast,
            persistTo(dir, 'b.jsonl'),
          );
          yield* Fiber.join(fiber);
          return second;
        });

      const bounded = yield* runPair(DEFAULT_GATE_CONFIG);
      Vitest.expect(bounded.waited).toBe(true);

      const overridden = yield* runPair(twoLanes);
      Vitest.expect(overridden.waited).toBe(false);
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('a light check does not wait behind the heavy lane but counts in flight', () =>
    Effect.gen(function* () {
      const dir = yield* workspace;
      const slow = Effect.sleep(120).pipe(Effect.as({ exit: 0, output: 'a', timedOut: false }));
      const fiber = yield* scheduleRun(
        request(dir, { key: 'gate-v1:heavy', session: 's1' }),
        slow,
        persistTo(dir, 'a.jsonl'),
      ).pipe(Effect.forkChild);
      yield* Effect.sleep(20);
      const light = yield* scheduleRun(
        request(dir, { key: 'gate-v1:light', lane: 'light', session: 's2' }),
        ok('l'),
        persistTo(dir, 'b.jsonl'),
      );
      yield* Fiber.join(fiber);
      Vitest.expect(light.waited).toBe(false);

      const capped: GateConfig = { ...DEFAULT_GATE_CONFIG, heavy: { lanes: 1, inFlight: 1 } };
      const first = yield* scheduleRun(
        request(dir, { key: 'gate-v1:cap-a', config: capped, session: 's3' }),
        slow.pipe(Effect.as({ exit: 0, output: 'a', timedOut: false })),
        persistTo(dir, 'c.jsonl'),
      ).pipe(Effect.forkChild);
      yield* Effect.sleep(20);
      const failure = yield* scheduleRun(
        request(dir, {
          key: 'gate-v1:cap-b',
          lane: 'light',
          config: capped,
          session: 's4',
          waitTimeoutSeconds: 0.05,
        }),
        ok('l'),
        persistTo(dir, 'd.jsonl'),
      ).pipe(Effect.flip);
      Vitest.expect(failure).toBeInstanceOf(GateWaitTimeout);
      yield* Fiber.join(first);
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('a waiter gives up with GateWaitTimeout', () =>
    Effect.gen(function* () {
      const dir = yield* workspace;
      const holder = yield* scheduleRun(
        request(dir, { key: 'gate-v1:hold', session: 's1' }),
        Effect.sleep(200).pipe(Effect.as({ exit: 0, output: 'a', timedOut: false })),
        persistTo(dir),
      ).pipe(Effect.forkChild);
      yield* Effect.sleep(20);
      const failure = yield* scheduleRun(
        request(dir, { key: 'gate-v1:hold', session: 's2', waitTimeoutSeconds: 0.05 }),
        ok(),
        persistTo(dir),
      ).pipe(Effect.flip);
      Vitest.expect(failure).toBeInstanceOf(GateWaitTimeout);
      yield* Fiber.join(holder);
    }).pipe(Effect.provide(Live), Effect.scoped),
  );
});

/** Seed a terminal state plus the record it points at. */
const seedTerminal = (dir: string, key: string, state: 'passed' | 'failed') =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const at = '2026-01-01T00:00:00Z';
    yield* fs.writeFileString(
      `${dir}/results.jsonl`,
      `${JSON.stringify({ at, exit: state === 'passed' ? 0 : 2, output: 'old', durationMs: 1 })}\n`,
    );
    const seed: RunState = {
      version: 1,
      key,
      command: 'printf ok',
      scope: ['repo'],
      fingerprint: 'fp-1',
      state,
      lane: 'heavy',
      attempts: [
        {
          owner: { session: 'old', task: 'A001', pid: process.pid },
          startedAt: at,
          heartbeatAt: at,
          leaseExpiresAt: at,
          finishedAt: at,
          exit: state === 'passed' ? 0 : 2,
          durationMs: 1,
        },
      ],
      waiters: [],
      resultPath: 'results.jsonl',
      resultIndex: 0,
    };
    yield* writeRunState(dir, seed);
  });

Vitest.describe('Scheduler truthfulness and durability', () => {
  Vitest.it.live('--no-reuse does not consume an old record while a lane is busy', () =>
    Effect.gen(function* () {
      const dir = yield* workspace;
      const key = 'gate-v1:old-pass';
      yield* seedTerminal(dir, key, 'passed');
      let executions = 0;
      const execute = Effect.suspend(() => {
        executions += 1;
        return ok('fresh');
      });
      const blocker = yield* scheduleRun(
        request(dir, { key: 'gate-v1:blocker', session: 's2' }),
        Effect.sleep(120).pipe(Effect.as({ exit: 0, output: 'b', timedOut: false })),
        persistTo(dir, 'b.jsonl'),
      ).pipe(Effect.forkChild);
      yield* Effect.sleep(20);
      const forced = yield* scheduleRun(
        request(dir, { key, session: 's3', reuse: false }),
        execute,
        persistTo(dir),
      );
      yield* Fiber.join(blocker);
      Vitest.expect(forced.reused).toBe(false);
      Vitest.expect(forced.output).toBe('fresh');
      Vitest.expect(executions).toBe(1);
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('a failed claim write fails the request instead of running unclaimed', () =>
    Effect.gen(function* () {
      const dir = yield* workspace;
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(`${dir}/.agents/@montflow/.runtime`, { recursive: true });
      yield* fs.writeFileString(`${dir}/.agents/@montflow/.runtime/runs`, 'not a directory');
      let executions = 0;
      const failure = yield* scheduleRun(
        request(dir),
        Effect.suspend(() => {
          executions += 1;
          return ok();
        }),
        persistTo(dir),
      ).pipe(Effect.flip);
      Vitest.expect(failure).toBeInstanceOf(SchedulerWriteError);
      Vitest.expect(executions).toBe(0);
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('a failed append leaves a re-runnable failed state and no pointerless pass', () =>
    Effect.gen(function* () {
      const dir = yield* workspace;
      const fs = yield* FileSystem.FileSystem;
      const key = 'gate-v1:test';
      const failure = yield* scheduleRun(request(dir, { session: 's1' }), ok('finished'), () =>
        Effect.fail('append failed' as const),
      ).pipe(Effect.flip);
      Vitest.expect(failure).toBe('append failed');
      const states = yield* listRunStates(dir);
      Vitest.expect(states).toHaveLength(1);
      // No record exists, so the run state must not claim a pass: a terminal
      // `passed` without a `resultIndex` would leave `consume` and `check`
      // telling different stories about the same key.
      Vitest.expect(states[0]?.state).toBe('failed');
      Vitest.expect(states[0]?.resultIndex).toBeUndefined();
      Vitest.expect(yield* fs.exists(`${dir}/results.jsonl`)).toBe(false);
      // A failure is never reused, so the key stays runnable: the next
      // requester claims attempt 2 and writes the first record, which its own
      // terminal state then points at.
      const rerun = yield* scheduleRun(
        request(dir, { session: 's2' }),
        ok('second'),
        persistTo(dir),
      );
      Vitest.expect(rerun.reused).toBe(false);
      Vitest.expect(rerun.attempt).toBe(2);
      const passed = (yield* listRunStates(dir)).find((state) => state.key === key);
      Vitest.expect(passed?.state).toBe('passed');
      Vitest.expect(passed?.resultIndex).toBe(0);
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live(
    'a slow append cannot mark a newer attempt finished or re-open single flight',
    () =>
      Effect.gen(function* () {
        const dir = yield* workspace;
        const fs = yield* FileSystem.FileSystem;
        const config: GateConfig = { ...DEFAULT_GATE_CONFIG, heavy: { lanes: 2, inFlight: 2 } };
        const key = 'gate-v1:race';
        const started: Array<string> = [];
        // Owner A fails at once; its record append is deliberately slow. The
        // append and the terminal write share one lock acquisition, so B cannot
        // claim attempt 2 until A's failure (and its record pointer) has landed.
        const ownerA = yield* scheduleRun(
          request(dir, { key, config, session: 's1' }),
          Effect.suspend(() => {
            started.push('A');
            return Effect.succeed({ exit: 1, output: 'a-failed', timedOut: false });
          }),
          (outcome: ScheduleOutcome) =>
            Effect.sleep(300).pipe(Effect.andThen(persistStage(dir, 's1')(outcome))),
        ).pipe(Effect.forkChild);
        yield* Effect.sleep(20);
        const ownerB = yield* scheduleRun(
          request(dir, { key, config, session: 's2' }),
          Effect.suspend(() => {
            started.push('B');
            return Effect.sleep(400).pipe(Effect.as({ exit: 0, output: 'b-ok', timedOut: false }));
          }),
          persistStage(dir, 's2'),
        ).pipe(Effect.forkChild);
        // C starts once B has claimed attempt 2: it must wait for B and consume
        // B's pass, never A's failure and never its own execution.
        for (let tries = 0; tries < 200 && !started.includes('B'); tries += 1) {
          yield* Effect.sleep(10);
        }
        const third = yield* scheduleRun(
          request(dir, { key, config, session: 's3', waitTimeoutSeconds: 5 }),
          Effect.suspend(() => {
            started.push('C');
            return ok('c-ok');
          }),
          persistStage(dir, 's3'),
        );
        const [first, second] = yield* Effect.all([Fiber.join(ownerA), Fiber.join(ownerB)]);
        Vitest.expect(started).toStrictEqual(['A', 'B']);
        Vitest.expect(first.state).toBe('failed');
        Vitest.expect(second.state).toBe('passed');
        Vitest.expect(second.attempt).toBe(2);
        // The third requester never ran: it waited on B's live attempt and
        // consumed B's own record, not A's failure.
        Vitest.expect(third.reused).toBe(true);
        Vitest.expect(third.attempt).toBe(2);
        Vitest.expect(third.output).toBe('b-ok');
        const states = yield* listRunStates(dir);
        Vitest.expect(states[0]?.state).toBe('passed');
        Vitest.expect(states[0]?.attempts).toHaveLength(2);
        Vitest.expect(states[0]?.attempts[1]?.exit).toBe(0);
        // The terminal state and its record are written together, so the state
        // always points at its own proof: record index 1 is B's newer pass, not
        // A's failure at index 0.
        const resultsText = yield* fs.readFileString(`${dir}/results.jsonl`);
        const records = parseGateResults(resultsText);
        Vitest.expect(records.issues).toStrictEqual([]);
        Vitest.expect(states[0]?.resultIndex).toBe(1);
        const pointerRecord = records.records[states[0]?.resultIndex ?? -1];
        Vitest.expect(pointerRecord?.verdict).toBe('pass');
        Vitest.expect(pointerRecord?.output).toBe('b-ok');
        const effective = latestResults(records.records).get(0);
        Vitest.expect(effective?.verdict).toBe('pass');
        Vitest.expect(effective?.exit).toBe(0);
        Vitest.expect(effective?.output).toBe('b-ok');
        const proof = verifyGateResults({
          gates: [
            '## Stage 0: Static (mechanical)',
            'command: printf ok',
            'scope: repo',
            '',
            '- [ ] The proof passes.',
            '',
          ].join('\n'),
          results: resultsText,
          complete: true,
          owner: 'A001',
        });
        Vitest.expect(proof.issues).toStrictEqual([]);
        Vitest.expect(proof.valid).toBe(true);
      }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('a resumed owner cannot clobber the attempt that reclaimed its lease', () =>
    Effect.gen(function* () {
      const dir = yield* workspace;
      const fs = yield* FileSystem.FileSystem;
      // A long lease with an even longer heartbeat keeps A's own renewals out of
      // the test; the lease is expired by rewriting A's attempt, exactly as a
      // paused process leaves it.
      const config: GateConfig = {
        ...DEFAULT_GATE_CONFIG,
        leaseSeconds: 60,
        heartbeatSeconds: 59,
        heavy: { lanes: 2, inFlight: 2 },
      };
      const key = 'gate-v1:reclaim';
      const started: Array<string> = [];
      const release = yield* Deferred.make<void>();
      const ownerA = yield* scheduleRun(
        request(dir, { key, config, session: 's1' }),
        Effect.suspend(() => {
          started.push('A');
          return Deferred.await(release).pipe(
            Effect.as({ exit: 7, output: 'a-failed', timedOut: false }),
          );
        }),
        persistStage(dir, 's1'),
      ).pipe(Effect.forkChild);
      // Wait for A's claim to land, then let the lease look expired.
      let claimed: RunState | undefined;
      for (let tries = 0; tries < 100 && claimed === undefined; tries += 1) {
        yield* Effect.sleep(10);
        const states = yield* listRunStates(dir);
        claimed = states.find((state) => state.key === key && state.state === 'running');
      }
      if (claimed === undefined)
        return yield* Effect.fail('owner A never claimed the key' as const);
      Vitest.expect(claimed.attempts).toHaveLength(1);
      const past = '2020-01-01T00:00:00Z';
      yield* writeRunState(dir, {
        ...claimed,
        attempts: claimed.attempts.map((entry) => ({
          ...entry,
          heartbeatAt: past,
          leaseExpiresAt: past,
        })),
      });
      // B reclaims the expired lease, runs attempt 2, and lands a pass.
      let executions = 0;
      const ownerB = yield* scheduleRun(
        request(dir, { key, config, session: 's2' }),
        Effect.suspend(() => {
          started.push('B');
          executions += 1;
          return ok('b-ok');
        }),
        persistStage(dir, 's2'),
      );
      Vitest.expect(ownerB.reclaimed).toBe(true);
      Vitest.expect(ownerB.attempt).toBe(2);
      Vitest.expect(ownerB.state).toBe('passed');
      Vitest.expect(executions).toBe(1);
      const passed = (yield* listRunStates(dir)).find((state) => state.key === key);
      Vitest.expect(passed?.state).toBe('passed');
      const bAttempt = passed?.attempts[1];
      Vitest.expect(bAttempt?.owner.session).toBe('s2');
      Vitest.expect(bAttempt?.exit).toBe(0);
      // A resumes after B already passed: its terminal write must not rewrite
      // B's entry or reset the key to A's failure.
      yield* Deferred.succeed(release, undefined);
      const first = yield* Fiber.join(ownerA);
      Vitest.expect(first.state).toBe('failed');
      Vitest.expect(first.exit).toBe(7);
      const after = (yield* listRunStates(dir)).find((state) => state.key === key);
      Vitest.expect(after?.state).toBe('passed');
      Vitest.expect(after?.attempts).toHaveLength(2);
      Vitest.expect(after?.attempts[1]?.owner.session).toBe('s2');
      Vitest.expect(after?.attempts[1]?.exit).toBe(0);
      Vitest.expect(after?.attempts[1]?.leaseExpiresAt).toBe(bAttempt?.leaseExpiresAt);
      Vitest.expect(after?.attempts[0]?.exit).toBeUndefined();
      Vitest.expect(after?.resultIndex).toBe(0);
      // F23: the effective record must stay B's pass. A resumed owner that no
      // longer owns the last attempt writes neither state nor record, so
      // `check` and the run state tell one story and a complete owner is clean.
      const resultsText = yield* fs.readFileString(`${dir}/results.jsonl`);
      const records = parseGateResults(resultsText);
      Vitest.expect(records.records).toHaveLength(1);
      Vitest.expect(latestResults(records.records).get(0)?.verdict).toBe('pass');
      Vitest.expect(latestResults(records.records).get(0)?.owner).toBe('s2');
      const proof = verifyGateResults({
        gates: [
          '## Stage 0: Static (mechanical)',
          'command: printf ok',
          'scope: repo',
          '',
          '- [ ] The proof passes.',
          '',
        ].join('\n'),
        results: resultsText,
        complete: true,
        owner: 'A001',
      });
      Vitest.expect(proof.issues).toStrictEqual([]);
      Vitest.expect(proof.valid).toBe(true);
      // A third requester reuses B's pass instead of rerunning the key.
      const third = yield* scheduleRun(
        request(dir, { key, config, session: 's3', waitTimeoutSeconds: 5 }),
        Effect.suspend(() => {
          started.push('C');
          return ok('c-ok');
        }),
        persistStage(dir, 's3'),
      );
      Vitest.expect(started).toStrictEqual(['A', 'B']);
      Vitest.expect(third.reused).toBe(true);
      Vitest.expect(third.state).toBe('passed');
      Vitest.expect(third.output).toBe('b-ok');
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('prunes old terminal states and keeps live ones', () =>
    Effect.gen(function* () {
      const dir = yield* workspace;
      const past = '2020-01-01T00:00:00Z';
      const terminal = (index: number): RunState => ({
        version: 1,
        key: `gate-v1:old-${index}`,
        command: `printf ${index}`,
        scope: ['repo'],
        fingerprint: 'fp-1',
        state: 'passed',
        lane: 'heavy',
        attempts: [
          {
            owner: { session: 's1', task: 'A001', pid: process.pid },
            startedAt: past,
            heartbeatAt: past,
            leaseExpiresAt: past,
            finishedAt: past,
            exit: 0,
          },
        ],
        waiters: [],
        resultPath: 'results.jsonl',
      });
      for (const index of [0, 1, 2, 3]) yield* writeRunState(dir, terminal(index));
      yield* writeRunState(dir, {
        ...terminal(9),
        key: 'gate-v1:live',
        state: 'running',
        attempts: [
          {
            owner: { session: 'live', task: 'A001', pid: process.pid },
            startedAt: '2026-11-03T00:00:00Z',
            heartbeatAt: '2026-11-03T00:00:00Z',
            leaseExpiresAt: '2099-01-01T00:00:00Z',
          },
        ],
      });
      yield* pruneRunStates(dir, Date.parse('2026-11-04T00:00:00Z'), 2);
      const remaining = yield* listRunStates(dir);
      Vitest.expect(remaining.filter((state) => state.state === 'passed')).toHaveLength(2);
      Vitest.expect(remaining.some((state) => state.key === 'gate-v1:live')).toBe(true);
    }).pipe(Effect.provide(Live), Effect.scoped),
  );
});
