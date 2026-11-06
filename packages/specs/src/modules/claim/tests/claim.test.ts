import * as Vitest from '@effect/vitest';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Path } from 'effect';

import {
  commitTransaction,
  renderPhaseStatus,
  renderSpecRow,
  renderSpecStatus,
  renderStatusField,
  withClaimsLock,
} from '../index.js';

const Platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);

Vitest.describe('Claim.render runtime', () => {
  const task = [
    '---',
    'id: A001',
    'name: build',
    'status: pending',
    '---',
    '',
    '# Task A001',
    '',
  ].join('\n');

  Vitest.it('rewrites only the task status field', () => {
    const next = renderStatusField(task, 'in-progress');
    Vitest.expect(next).toContain('status: in-progress');
    Vitest.expect(next).toContain('name: build');
    Vitest.expect(next.replace('status: in-progress', 'status: pending')).toBe(task);
  });

  Vitest.it('rewrites only the matching SPEC.md row', () => {
    const spec = [
      '---',
      'name: ship-login',
      'status: in-progress',
      '---',
      '',
      '| ID | Name | Type | Status | Gates |',
      '| --- | --- | --- | --- | --- |',
      '| A001 | build | execution | pending | Yes |',
      '| A002 | wire | execution | pending | Yes |',
      '',
    ].join('\n');
    const next = renderSpecRow(spec, 'A001', 'blocked');
    Vitest.expect(next).toContain('| A001 | build | execution | blocked | Yes |');
    Vitest.expect(next).toContain('| A002 | wire | execution | pending | Yes |');
    Vitest.expect(renderSpecRow(spec, 'Z999', 'blocked')).toBeUndefined();
  });

  Vitest.it('rewrites the spec status and the phase mirror', () => {
    const spec = ['---', 'name: ship-login', 'status: in-progress', '---', ''].join('\n');
    Vitest.expect(renderSpecStatus(spec, 'complete')).toContain('status: complete');
    const phase = [
      '---',
      'id: A',
      'objective: Build it.',
      'status: pending',
      'review: required',
      'gate: none',
      '---',
      '',
    ].join('\n');
    Vitest.expect(renderPhaseStatus(phase, 'in-progress')).toContain('status: in-progress');
    Vitest.expect(renderPhaseStatus(phase, 'in-progress')).toContain('review: required');
  });
});

Vitest.describe('Claim.transaction runtime', () => {
  Vitest.it.effect('writes every file when every rename succeeds', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const a = `${dir}/a.txt`;
      const b = `${dir}/b.txt`;
      yield* fs.writeFileString(a, 'old-a');
      yield* fs.writeFileString(b, 'old-b');
      yield* commitTransaction([
        { path: a, content: 'new-a' },
        { path: b, content: 'new-b' },
      ]);
      Vitest.expect(yield* fs.readFileString(a)).toBe('new-a');
      Vitest.expect(yield* fs.readFileString(b)).toBe('new-b');
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('rolls every already-renamed file back when a later rename fails', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped();
      const a = path.join(dir, 'a.txt');
      const b = path.join(dir, 'b.txt');
      const c = path.join(dir, 'c.txt');
      yield* fs.writeFileString(a, 'old-a');
      yield* fs.writeFileString(b, 'old-b');
      let failed = false;
      const result = yield* commitTransaction(
        [
          { path: a, content: 'new-a' },
          { path: b, content: 'new-b' },
          { path: c, content: 'new-c' },
        ],
        {
          rename: (from, to, index) =>
            index === 2 && !failed
              ? Effect.sync(() => {
                  failed = true;
                }).pipe(Effect.flatMap(() => Effect.fail(new Error('injected rename failure'))))
              : fs.rename(from, to),
        },
      ).pipe(Effect.result);
      Vitest.expect('failure' in result).toBe(true);
      Vitest.expect(yield* fs.readFileString(a)).toBe('old-a');
      Vitest.expect(yield* fs.readFileString(b)).toBe('old-b');
      Vitest.expect(yield* fs.exists(c)).toBe(false);
      const leftovers = (yield* fs.readDirectory(dir)).filter((name) => name.includes('.tmp-'));
      Vitest.expect(leftovers).toStrictEqual([]);
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('removes a stale registry lock after the body finishes', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const value = yield* withClaimsLock(dir, Effect.succeed('ok'));
      Vitest.expect(value).toBe('ok');
      const runtime = yield* fs.readDirectory(`${dir}/.agents/@montflow/.runtime`);
      Vitest.expect(runtime).not.toContain('claims.lock');
    }).pipe(Effect.provide(Platform)),
  );
});
