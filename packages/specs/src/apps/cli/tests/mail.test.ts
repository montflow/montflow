import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { NodeServices } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { Effect, FileSystem, Layer, Path } from 'effect';
import { TestClock } from 'effect/testing';

import { CHANNEL_CODES, parseChannel, verifyChannel } from '../../../modules/channel/index.js';
import { phaseMarkdown } from '../../../modules/phase/tests/helpers.js';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { memoryMarkdown, taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { parseTaskFile } from '../../../modules/task/index.js';
import { type CheckReport, SurfaceError, check, storeDirOf } from '../index.js';
import {
  type SessionSteerPort,
  SteerFailure,
  type MailReport,
  mailPhaseOf,
  opencodeSteerArgs,
  sendMail,
} from '../index.js';
import { SpecStore } from '../../../services/index.js';

const Live = Layer.provideMerge(SpecStore.Default, NodeServices.layer);

interface Work {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  /** Workspace root that owns `.agents/`. */
  readonly dir: string;
  /** `<dir>/.agents/@montflow/specs`. */
  readonly root: string;
}

const prepare = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-mail-' });
  const root = path.join(dir, storeDirOf('.'));
  yield* fs.makeDirectory(root, { recursive: true });
  return { fs, path, dir, root } satisfies Work;
});

const write = (work: Work, relative: string, content: string) =>
  Effect.gen(function* () {
    const target = work.path.join(work.dir, relative);
    yield* work.fs.makeDirectory(work.path.dirname(target), { recursive: true });
    yield* work.fs.writeFileString(target, content);
  });

const read = (work: Work, relative: string) =>
  work.fs.readFileString(work.path.join(work.dir, relative)).pipe(Effect.orElseSucceed(() => ''));

const writeClaims = (
  work: Work,
  claims: ReadonlyArray<{ spec: string; task: string; session: string }>,
) =>
  write(
    work,
    '.agents/@montflow/.runtime/claims.json',
    JSON.stringify({
      schema: 1,
      claims: claims.map((claim) => ({ ...claim, at: '2026-11-03T12:00:00Z' })),
    }),
  );

const seedSpec = (work: Work) =>
  Effect.gen(function* () {
    const store = storeDirOf('.');
    const name = 'mail-spec';
    yield* write(
      work,
      `${store}/${name}/SPEC.md`,
      specMarkdown({
        name,
        status: 'in-progress',
        version: '2',
        rows: [
          { id: 'A001', name: 'implement', type: 'execution', status: 'pending', gates: 'No' },
          { id: 'A002', name: 'verify', type: 'execution', status: 'pending', gates: 'No' },
        ],
      }),
    );
    yield* write(
      work,
      `${store}/${name}/A/PHASE.md`,
      phaseMarkdown({ id: 'A', status: 'pending' }),
    );
    yield* write(work, `${store}/${name}/A/MEMORY.md`, memoryMarkdown());
    for (const [id, leaf] of [
      ['A001', 'implement'],
      ['A002', 'verify'],
    ] as const) {
      yield* write(
        work,
        `${store}/${name}/A/${id}-${leaf}/TASK.md`,
        taskMarkdown({ id, name: leaf }),
      );
      yield* write(work, `${store}/${name}/A/${id}-${leaf}/MEMORY.md`, memoryMarkdown());
    }
    return name;
  });

/** A recording steer port: every call is captured, and success/failure is chosen. */
interface RecordingPort {
  readonly port: SessionSteerPort;
  readonly calls: Array<readonly [string, string]>;
}

const recorder = (outcome: 'ok' | 'fail'): RecordingPort => {
  const calls: Array<readonly [string, string]> = [];
  return {
    calls,
    port: {
      steer: (session, text) => {
        calls.push([session, text]);
        return outcome === 'ok'
          ? Effect.void
          : Effect.fail(new SteerFailure({ message: 'session is gone' }));
      },
    },
  };
};

const codesOf = (report: CheckReport): ReadonlyArray<string | undefined> =>
  report.specs.flatMap((spec) => spec.issues.map((found) => found.code));

const codeOf = (error: SurfaceError | SpecStore.StoreError): string | undefined =>
  error instanceof SurfaceError ? error.diagnostics[0]?.code : undefined;

const options = (
  work: Work,
  name: string,
  extra: {
    readonly to: string;
    readonly text: string;
    readonly phase?: string;
    readonly session?: string;
    readonly steer?: SessionSteerPort;
  },
) => ({
  root: work.root,
  workspace: work.dir,
  name,
  to: extra.to,
  text: extra.text,
  phase: extra.phase,
  session: extra.session,
  steer: extra.steer,
});

Vitest.describe('Cli.mail runtime', () => {
  Vitest.it.effect('delivers to a live bound task by steering its session', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const name = yield* seedSpec(work);
      yield* writeClaims(work, [
        { spec: name, task: 'orchestrator', session: 'sess-orch' },
        { spec: name, task: 'A001', session: 'sess-worker' },
      ]);
      const { port, calls } = recorder('ok');
      const report: MailReport = yield* sendMail(
        options(work, name, {
          to: 'A001',
          text: 'Read the new gate.',
          session: 'sess-orch',
          steer: port,
        }),
      );
      Vitest.expect(report.delivery).toBe('delivered-live');
      Vitest.expect(report.session).toBe('sess-worker');
      Vitest.expect(report.path).toBe('A/A001-implement/MAILBOX.md');
      Vitest.expect(calls).toHaveLength(1);
      Vitest.expect(calls[0]?.[0]).toBe('sess-worker');
      Vitest.expect(calls[0]?.[1]).toContain('Read the new gate.');

      const content = yield* read(
        work,
        '.agents/@montflow/specs/mail-spec/A/A001-implement/MAILBOX.md',
      );
      Vitest.expect(content.startsWith('# Mailbox\n\n## ')).toBe(true);
      const parsed = parseChannel('mailbox', content);
      Vitest.expect(parsed.issues).toStrictEqual([]);
      Vitest.expect(parsed.entries[0]).toMatchObject({
        from: 'orchestrator',
        to: 'A001',
        body: 'Read the new gate.',
      });
      Vitest.expect(parsed.entries[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      Vitest.expect(report.at).toBe(parsed.entries[0]?.at);
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('queues to a non-live task and the entry is readable at task start', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const name = yield* seedSpec(work);
      yield* writeClaims(work, [{ spec: name, task: 'orchestrator', session: 'sess-orch' }]);
      const { port, calls } = recorder('ok');
      const report = yield* sendMail(
        options(work, name, {
          to: 'A001',
          text: 'Your question is answered: use the second fixture.',
          session: 'sess-orch',
          steer: port,
        }),
      );
      Vitest.expect(report.delivery).toBe('queued');
      Vitest.expect(calls).toStrictEqual([]);
      const content = yield* read(
        work,
        '.agents/@montflow/specs/mail-spec/A/A001-implement/MAILBOX.md',
      );
      Vitest.expect(content).toContain('use the second fixture');
      // A worker reads its mailbox at task start; the checker sees the same entry.
      const verified = verifyChannel('mailbox', content, {
        taskIds: new Set(['A001', 'A002']),
        owner: 'A001',
      });
      Vitest.expect(verified.issues).toStrictEqual([]);
      const checked = yield* check(work.root, { name });
      Vitest.expect(codesOf(checked)).not.toContain(CHANNEL_CODES.mailMalformedEntry);
      Vitest.expect(codesOf(checked)).not.toContain(CHANNEL_CODES.mailUnknownRecipient);
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('keeps the entry and queues when steering fails', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const name = yield* seedSpec(work);
      yield* writeClaims(work, [
        { spec: name, task: 'orchestrator', session: 'sess-orch' },
        { spec: name, task: 'A001', session: 'sess-worker' },
      ]);
      const { port } = recorder('fail');
      const report = yield* sendMail(
        options(work, name, {
          to: 'A001',
          text: 'Still delivered.',
          session: 'sess-orch',
          steer: port,
        }),
      );
      Vitest.expect(report.delivery).toBe('queued');
      Vitest.expect(report.warning?.code).toBe(CHANNEL_CODES.mailSteerFailed);
      const content = yield* read(
        work,
        '.agents/@montflow/specs/mail-spec/A/A001-implement/MAILBOX.md',
      );
      Vitest.expect(content).toContain('Still delivered.');
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('refuses a worker sender and writes nothing', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const name = yield* seedSpec(work);
      yield* writeClaims(work, [{ spec: name, task: 'A001', session: 'sess-worker' }]);
      const { port } = recorder('ok');
      const error = yield* sendMail(
        options(work, name, { to: 'A002', text: 'Nope.', session: 'sess-worker', steer: port }),
      ).pipe(Effect.flip);
      Vitest.expect(codeOf(error)).toBe(CHANNEL_CODES.mailNotOrchestrator);
      Vitest.expect(
        yield* read(work, '.agents/@montflow/specs/mail-spec/A/A002-verify/MAILBOX.md'),
      ).toBe('');
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('refuses an unknown addressee by name before writing', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const name = yield* seedSpec(work);
      yield* writeClaims(work, [{ spec: name, task: 'orchestrator', session: 'sess-orch' }]);
      const error = yield* sendMail(
        options(work, name, { to: 'Z999', text: 'Hello?', session: 'sess-orch' }),
      ).pipe(Effect.flip);
      Vitest.expect(codeOf(error)).toBe(CHANNEL_CODES.mailUnknownRecipient);
      Vitest.expect(
        yield* read(work, '.agents/@montflow/specs/mail-spec/A/Z999-nowhere/MAILBOX.md'),
      ).toBe('');
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('writes a board entry addressed to all and never steers it', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const name = yield* seedSpec(work);
      yield* writeClaims(work, [
        { spec: name, task: 'orchestrator', session: 'sess-orch' },
        { spec: name, task: 'A001', session: 'sess-worker' },
      ]);
      const { port, calls } = recorder('ok');
      const report = yield* sendMail(
        options(work, name, {
          to: 'all',
          text: 'Phase starts now.',
          session: 'sess-orch',
          steer: port,
        }),
      );
      Vitest.expect(report.delivery).toBe('queued');
      Vitest.expect(report.path).toBe('A/BOARD.md');
      Vitest.expect(calls).toStrictEqual([]);
      const content = yield* read(work, '.agents/@montflow/specs/mail-spec/A/BOARD.md');
      const parsed = parseChannel('board', content);
      Vitest.expect(parsed.entries[0]).toMatchObject({ from: 'orchestrator', to: 'all' });
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('appends without rewriting the earlier entry and stamps the new one', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const name = yield* seedSpec(work);
      yield* writeClaims(work, [{ spec: name, task: 'orchestrator', session: 'sess-orch' }]);
      yield* TestClock.setTime(Date.UTC(2026, 10, 3, 12, 0, 0));
      const original = [
        '# Mailbox',
        '',
        '## 2026-11-01T09:00:00Z \u00b7 from orchestrator \u00b7 to A001',
        '',
        'Older entry.',
        '',
      ].join('\n');
      yield* write(work, '.agents/@montflow/specs/mail-spec/A/A001-implement/MAILBOX.md', original);
      const report = yield* sendMail(
        options(work, name, { to: 'A001', text: 'Newer entry.', session: 'sess-orch' }),
      );
      const content = yield* read(
        work,
        '.agents/@montflow/specs/mail-spec/A/A001-implement/MAILBOX.md',
      );
      Vitest.expect(content.startsWith(original)).toBe(true);
      const parsed = parseChannel('mailbox', content);
      Vitest.expect(parsed.issues).toStrictEqual([]);
      Vitest.expect(parsed.entries).toHaveLength(2);
      Vitest.expect(parsed.entries[1]?.at).toBe(report.at);
      Vitest.expect((parsed.entries[1]?.at ?? '') >= (parsed.entries[0]?.at ?? '')).toBe(true);
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('never appends an out-of-order entry when the clock is behind', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const name = yield* seedSpec(work);
      yield* writeClaims(work, [{ spec: name, task: 'orchestrator', session: 'sess-orch' }]);
      const original = [
        '# Mailbox',
        '',
        '## 2026-11-01T09:00:00Z \u00b7 from orchestrator \u00b7 to A001',
        '',
        'Older entry.',
        '',
      ].join('\n');
      yield* write(work, '.agents/@montflow/specs/mail-spec/A/A001-implement/MAILBOX.md', original);
      // The test clock starts at 1970, behind the existing entry.
      yield* TestClock.setTime(0);
      const report = yield* sendMail(
        options(work, name, { to: 'A001', text: 'Still ordered.', session: 'sess-orch' }),
      );
      Vitest.expect(report.at).toBe('2026-11-01T09:00:00Z');
      const parsed = parseChannel(
        'mailbox',
        yield* read(work, '.agents/@montflow/specs/mail-spec/A/A001-implement/MAILBOX.md'),
      );
      Vitest.expect(parsed.issues).toStrictEqual([]);
      Vitest.expect(parsed.entries.map((found) => found.at)).toStrictEqual([
        '2026-11-01T09:00:00Z',
        '2026-11-01T09:00:00Z',
      ]);
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('refuses to append to a malformed channel', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const name = yield* seedSpec(work);
      yield* writeClaims(work, [{ spec: name, task: 'orchestrator', session: 'sess-orch' }]);
      const malformed = '# Mailbox\n\n## nope\n\nbody\n';
      yield* write(
        work,
        '.agents/@montflow/specs/mail-spec/A/A001-implement/MAILBOX.md',
        malformed,
      );
      const error = yield* sendMail(
        options(work, name, { to: 'A001', text: 'Should not land.', session: 'sess-orch' }),
      ).pipe(Effect.flip);
      Vitest.expect(codeOf(error)).toBe(CHANNEL_CODES.mailMalformedEntry);
      Vitest.expect(
        yield* read(work, '.agents/@montflow/specs/mail-spec/A/A001-implement/MAILBOX.md'),
      ).toBe(malformed);
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('writes only the channel: task and claim records are untouched', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const name = yield* seedSpec(work);
      yield* writeClaims(work, [{ spec: name, task: 'orchestrator', session: 'sess-orch' }]);
      const taskPath = '.agents/@montflow/specs/mail-spec/A/A001-implement/TASK.md';
      const before = yield* read(work, taskPath);
      const claimsBefore = yield* read(work, '.agents/@montflow/.runtime/claims.json');
      yield* sendMail(options(work, name, { to: 'A001', text: 'Ping.', session: 'sess-orch' }));
      Vitest.expect(yield* read(work, taskPath)).toBe(before);
      Vitest.expect(yield* read(work, '.agents/@montflow/.runtime/claims.json')).toBe(claimsBefore);
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('refuses a body that would start another entry', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const name = yield* seedSpec(work);
      yield* writeClaims(work, [{ spec: name, task: 'orchestrator', session: 'sess-orch' }]);
      const error = yield* sendMail(
        options(work, name, { to: 'A001', text: '## second entry', session: 'sess-orch' }),
      ).pipe(Effect.flip);
      Vitest.expect(codeOf(error)).toBe(CHANNEL_CODES.mailMalformedEntry);
      Vitest.expect(
        yield* read(work, '.agents/@montflow/specs/mail-spec/A/A001-implement/MAILBOX.md'),
      ).toBe('');
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it('derives the active phase for a board without --phase', () => {
    const snapshot = {
      name: 'mail-spec',
      files: [
        { path: 'A/PHASE.md', content: '' },
        {
          path: 'A/A001-implement/TASK.md',
          content: taskMarkdown({ id: 'A001', name: 'implement' }),
        },
      ],
    };
    Vitest.expect(
      mailPhaseOf(snapshot, [
        {
          dir: 'A/A001-implement',
          id: 'A001',
          phase: 'A',
          task: parseTaskFile(taskMarkdown({ id: 'A001', name: 'implement' })),
        },
      ]),
    ).toBe('A');
  });
});

Vitest.describe('Cli.mail default steer route', () => {
  Vitest.it('posts the entry to the v2 session prompt route with a text body', () => {
    Vitest.expect(opencodeSteerArgs('sess-1', 'Read this.')).toStrictEqual([
      'api',
      'POST',
      '/api/session/sess-1/prompt',
      '--data',
      JSON.stringify({ text: 'Read this.' }),
    ]);
  });
});

Vitest.describe('spec-execute channel guidance', () => {
  Vitest.it('names the board, the mailbox, mail, and the dependency rule', () => {
    const file = resolve(import.meta.dirname, '../../../../prompts/spec-execute.json');
    // SAFETY: `spec-execute.json` is this package's own prompt file; its
    // `template` is a required string in the prompt schema verified by the
    // package's prompt tests, so the read is checked at this boundary.
    const template = (JSON.parse(readFileSync(file, 'utf8')) as { template: string }).template;
    Vitest.expect(template).toContain('BOARD.md');
    Vitest.expect(template).toContain('MAILBOX.md');
    Vitest.expect(template).toContain('mf-specs mail --name');
    Vitest.expect(template).toContain('depends-on');
  });
});
