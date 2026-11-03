import { NodeServices } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { Effect, FileSystem, Layer, Path } from 'effect';

import { CHANNEL_CODES } from '../../../modules/channel/index.js';
import { phaseMarkdown } from '../../../modules/phase/tests/helpers.js';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { memoryMarkdown, taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { type CheckReport, check, storeDirOf } from '../index.js';
import { SpecStore } from '../../../services/index.js';

const Live = Layer.provideMerge(SpecStore.Default, NodeServices.layer);

interface Work {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly dir: string;
  readonly root: string;
}

const prepare = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-channel-' });
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

const seedSpec = (work: Work) =>
  Effect.gen(function* () {
    const store = storeDirOf('.');
    const name = 'channel-spec';
    yield* write(
      work,
      `${store}/${name}/SPEC.md`,
      specMarkdown({
        name,
        status: 'in-progress',
        version: '2',
        rows: [
          { id: 'A001', name: 'implement', type: 'execution', status: 'pending', gates: 'No' },
        ],
      }),
    );
    yield* write(
      work,
      `${store}/${name}/A/PHASE.md`,
      phaseMarkdown({ id: 'A', status: 'pending' }),
    );
    yield* write(work, `${store}/${name}/A/MEMORY.md`, memoryMarkdown());
    yield* write(
      work,
      `${store}/${name}/A/A001-implement/TASK.md`,
      taskMarkdown({ id: 'A001', name: 'implement' }),
    );
    yield* write(work, `${store}/${name}/A/A001-implement/MEMORY.md`, memoryMarkdown());
    return name;
  });

const codesOf = (report: CheckReport): ReadonlyArray<string | undefined> =>
  report.specs.flatMap((spec) => spec.issues.map((found) => found.code));

/** One valid entry heading, with the middle dot the grammar requires. */
const entry = (at: string, to: string, from = 'orchestrator', body = 'A fact.'): string =>
  `## ${at} \u00b7 from ${from} \u00b7 to ${to}\n\n${body}\n`;

Vitest.describe('Channel through check runtime', () => {
  Vitest.it.effect('rejects a malformed board entry with the offending line named', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const name = yield* seedSpec(work);
      yield* write(
        work,
        `${storeDirOf('.')}/${name}/A/BOARD.md`,
        ['# Board', '', '## not an entry', '', 'Body.', ''].join('\n'),
      );
      const report = yield* check(work.root, { name });
      Vitest.expect(codesOf(report)).toContain(CHANNEL_CODES.boardMalformedEntry);
      const found = report.specs[0]?.issues.find(
        (issue) => issue.code === CHANNEL_CODES.boardMalformedEntry,
      );
      Vitest.expect(found?.line).toBe(3);
      Vitest.expect(found?.field).toBe('A/BOARD.md: BOARD.md:3');
      Vitest.expect(found?.message).toContain('line 3');
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('rejects an unknown mailbox addressee by name with the line', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const name = yield* seedSpec(work);
      yield* write(
        work,
        `${storeDirOf('.')}/${name}/A/A001-implement/MAILBOX.md`,
        `# Mailbox\n\n${entry('2026-11-02T21:15:00Z', 'Z999')}`,
      );
      const report = yield* check(work.root, { name });
      Vitest.expect(codesOf(report)).toContain(CHANNEL_CODES.mailUnknownRecipient);
      const found = report.specs[0]?.issues.find(
        (issue) => issue.code === CHANNEL_CODES.mailUnknownRecipient,
      );
      Vitest.expect(found?.message).toContain("'Z999'");
      Vitest.expect(found?.field).toBe('A/A001-implement/MAILBOX.md: MAILBOX.md:3');
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('accepts a valid board and mailbox without a finding', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const name = yield* seedSpec(work);
      yield* write(
        work,
        `${storeDirOf('.')}/${name}/A/BOARD.md`,
        `# Board\n\n${entry('2026-11-02T21:15:00Z', 'all')}`,
      );
      yield* write(
        work,
        `${storeDirOf('.')}/${name}/A/A001-implement/MAILBOX.md`,
        `# Mailbox\n\n${entry('2026-11-02T21:16:00Z', 'A001')}`,
      );
      const report = yield* check(work.root, { name });
      Vitest.expect(codesOf(report)).not.toContain(CHANNEL_CODES.boardMalformedEntry);
      Vitest.expect(codesOf(report)).not.toContain(CHANNEL_CODES.mailUnknownRecipient);
      Vitest.expect(codesOf(report)).not.toContain(CHANNEL_CODES.mailRecipientMismatch);
    }).pipe(Effect.provide(Live)),
  );
});
