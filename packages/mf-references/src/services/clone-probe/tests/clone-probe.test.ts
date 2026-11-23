import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import * as Vitest from '@effect/vitest';
import { CloneProbe, Git, Reference } from '../../../index.js';

const Live = Layer.provide(CloneProbe.Default, Layer.mergeAll(NodeFileSystem.layer, Git.Default));

/** Run git in `cwd`, rejecting on a non-zero exit. Tests may import node:* directly. */
const git = (cwd: string, args: ReadonlyArray<string>): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile('git', [...args], { cwd }, (error, stdout, stderr) => {
      if (error === null) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(stderr.trim() || error.message));
    });
  });

/** Reference metadata for the probe; `ref` is supplied per test. */
const reference = (ref?: string): Reference.Reference => {
  const fields = {
    name: 'effect',
    url: 'https://github.com/example/effect.git',
    purpose: 'Effect source.',
    added: '2026-07-22',
  };
  if (ref === undefined) return Reference.Reference.make(fields);
  return Reference.Reference.make({ ...fields, ref });
};

/** Create `<root>/.agents/references/effect` as a git work tree with one commit. */
const makeClone = async (root: string): Promise<{ dir: string; first: string }> => {
  const dir = Reference.clonePath(root, 'effect');
  await mkdir(dir, { recursive: true });
  await git(dir, ['init', '-b', 'main']);
  await git(dir, ['config', 'user.email', 'test@example.com']);
  await git(dir, ['config', 'user.name', 'Test']);
  await git(dir, ['remote', 'add', 'origin', 'https://github.com/example/effect.git']);
  await writeFile(join(dir, 'file.txt'), 'one\n');
  await git(dir, ['add', 'file.txt']);
  await git(dir, ['commit', '-m', 'first']);
  const first = await git(dir, ['rev-parse', 'HEAD']);
  return { dir, first };
};

/** Commit another change and return its commit id. */
const secondCommit = async (dir: string): Promise<string> => {
  await writeFile(join(dir, 'file.txt'), 'two\n');
  await git(dir, ['add', 'file.txt']);
  await git(dir, ['commit', '-m', 'second']);
  return git(dir, ['rev-parse', 'HEAD']);
};

const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-references-clone-'));

Vitest.describe('CloneProbe', () => {
  Vitest.it.effect('reports a missing clone without touching the filesystem', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const probe = yield* CloneProbe.CloneProbe;

      const observed = yield* probe.probe(root, reference());
      Vitest.expect(observed).toMatchObject({
        path: Reference.clonePath(root, 'effect'),
        state: 'missing',
        present: false,
        gitWorkTree: false,
        dirtyPaths: 0,
      });

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('reports a clean clone at the recorded commit', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const { first } = yield* Effect.promise(() => makeClone(root));
      const probe = yield* CloneProbe.CloneProbe;

      const observed = yield* probe.probe(root, reference(first));
      Vitest.expect(observed).toMatchObject({
        state: 'present',
        present: true,
        isDirectory: true,
        gitWorkTree: true,
        dirtyPaths: 0,
        head: first,
        currentRef: 'main',
        origin: 'https://github.com/example/effect.git',
        matchesOrigin: true,
        refResolved: true,
        resolvedRefHead: first,
        matchesRef: true,
      });

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('reports a dirty clone with its changed-path count', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const { dir, first } = yield* Effect.promise(() => makeClone(root));
      yield* Effect.promise(() => writeFile(join(dir, 'scratch.txt'), 'untracked\n'));
      const probe = yield* CloneProbe.CloneProbe;

      const observed = yield* probe.probe(root, reference(first));
      Vitest.expect(observed.state).toBe('dirty');
      Vitest.expect(observed.dirtyPaths).toBe(1);
      Vitest.expect(observed.matchesRef).toBe(true);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('reports a ref mismatch when HEAD is not the recorded commit', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const { dir, first } = yield* Effect.promise(() => makeClone(root));
      const second = yield* Effect.promise(() => secondCommit(dir));
      const probe = yield* CloneProbe.CloneProbe;

      const observed = yield* probe.probe(root, reference(first));
      Vitest.expect(observed).toMatchObject({
        state: 'ref-mismatch',
        head: second,
        refResolved: true,
        resolvedRefHead: first,
        matchesRef: false,
      });

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('reports an unresolvable recorded ref', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => makeClone(root));
      const probe = yield* CloneProbe.CloneProbe;

      const observed = yield* probe.probe(root, reference('missing-branch'));
      Vitest.expect(observed).toMatchObject({
        state: 'ref-mismatch',
        refResolved: false,
        matchesRef: false,
      });

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('reports a directory that is not a git work tree', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const dir = Reference.clonePath(root, 'effect');
      yield* Effect.promise(() => mkdir(dir, { recursive: true }));
      const probe = yield* CloneProbe.CloneProbe;

      const observed = yield* probe.probe(root, reference());
      Vitest.expect(observed).toMatchObject({
        state: 'present',
        present: true,
        isDirectory: true,
        gitWorkTree: false,
      });

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );
});
