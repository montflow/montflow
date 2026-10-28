import { execFile } from 'node:child_process';
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import type { FileSystem, Path } from 'effect';
import * as Vitest from '@effect/vitest';
import { CloneProbe, Git, Reference, ReferenceStore } from '../../../index.js';

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

const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-references-life-'));

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const readOrEmpty = async (path: string): Promise<string> => {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
};

/** A workspace root that is a git work tree, as `add` requires. */
const makeWorkspace = async (): Promise<string> => {
  const root = await freshRoot();
  await git(root, ['init', '-b', 'main']);
  await git(root, ['config', 'user.email', 'test@example.com']);
  await git(root, ['config', 'user.name', 'Test']);
  await writeFile(join(root, 'workspace.txt'), 'workspace\n');
  await git(root, ['add', 'workspace.txt']);
  await git(root, ['commit', '-m', 'workspace']);
  return root;
};

/** One upstream repository with a first commit and two tag spellings. */
interface Origin {
  readonly dir: string;
  readonly first: string;
}

const makeOrigin = async (): Promise<Origin> => {
  const dir = await freshRoot();
  await git(dir, ['init', '-b', 'main']);
  await git(dir, ['config', 'user.email', 'test@example.com']);
  await git(dir, ['config', 'user.name', 'Test']);
  await writeFile(join(dir, 'file.txt'), 'one\n');
  await git(dir, ['add', 'file.txt']);
  await git(dir, ['commit', '-m', 'first']);
  const first = await git(dir, ['rev-parse', 'HEAD']);
  await git(dir, ['tag', 'v1']);
  await git(dir, ['tag', '-a', 'v2', '-m', 'release']);
  return { dir, first };
};

/** Add one commit to an origin and return its id. */
const advanceOrigin = async (dir: string): Promise<string> => {
  await writeFile(join(dir, 'file.txt'), 'two\n');
  await git(dir, ['add', 'file.txt']);
  await git(dir, ['commit', '-m', 'second']);
  return git(dir, ['rev-parse', 'HEAD']);
};

/** Clone `origin` into the derived path, then give it the entry's https origin. */
const makeClone = async (
  root: string,
  slug: string,
  origin: string,
  url: string,
  rewrite = true,
): Promise<string> => {
  const dir = Reference.clonePath(root, slug);
  await mkdir(join(root, Reference.CLONE_DIR), { recursive: true });
  await git(root, ['clone', '--quiet', origin, dir]);
  await git(dir, ['config', 'user.email', 'test@example.com']);
  await git(dir, ['config', 'user.name', 'Test']);
  await git(dir, ['remote', 'set-url', 'origin', url]);
  if (rewrite) await git(dir, ['config', `url.${origin}.insteadOf`, url]);
  return dir;
};

/** One test port's recorded calls. */
interface CallLog {
  readonly clone: Array<string>;
  readonly fetch: Array<string>;
  readonly lsRemote: Array<ReadonlyArray<string>>;
}

/** Read the configured origin URL, without git's `insteadOf` rewriting. */
const rawOrigin = (path: string): Effect.Effect<string | undefined> =>
  Effect.promise(async () => {
    try {
      const value = await git(path, ['config', '--get', 'remote.origin.url']);
      return value === '' ? undefined : value;
    } catch {
      return undefined;
    }
  });

/** A port that keeps the configured origin instead of a rewritten fetch URL. */
const rawOriginPort = Layer.unwrap(
  Effect.gen(function* () {
    const base = yield* Git.GitPort;
    const impl: Git.GitPortImpl = { ...base, origin: rawOrigin };
    return Layer.succeed(Git.GitPort, impl);
  }),
).pipe(Layer.provide(Git.Default));

/** A recording port that maps every https clone onto one local fixture. */
const recordingPort = (origin: string, calls: CallLog) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const base = yield* Git.GitPort;
      const impl: Git.GitPortImpl = {
        ...base,
        origin: rawOrigin,
        clone: (url, destination) =>
          Effect.gen(function* () {
            calls.clone.push(url);
            const result = yield* base.clone(origin, destination);
            if (result.ok) {
              yield* Effect.promise(() => git(destination, ['remote', 'set-url', 'origin', url]));
              yield* Effect.promise(() =>
                git(destination, ['config', `url.${origin}.insteadOf`, url]),
              );
            }
            return result;
          }),
        fetch: (path) => {
          calls.fetch.push(path);
          return base.fetch(path);
        },
        lsRemote: (path, patterns) => {
          calls.lsRemote.push(patterns);
          return base.lsRemote(path, patterns);
        },
      };
      return Layer.succeed(Git.GitPort, impl);
    }),
  ).pipe(Layer.provide(Git.Default));

const counters = (): CallLog => ({
  clone: [],
  fetch: [],
  lsRemote: [],
});

const nodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

const composeLive = (
  port: Layer.Layer<Git.GitPort>,
  storeLayer: Layer.Layer<ReferenceStore.ReferenceStore, never, FileSystem.FileSystem | Path.Path>,
) => {
  const store = storeLayer.pipe(Layer.provide(nodeLive));
  const probe = CloneProbe.Default.pipe(Layer.provide(Layer.mergeAll(port, nodeLive)));
  const providers = Layer.mergeAll(port, nodeLive, store, probe);
  return Layer.mergeAll(providers, Git.GitLifecycleDefault.pipe(Layer.provide(providers)));
};

const realLive = composeLive(rawOriginPort, ReferenceStore.Default);

const cloningLive = (origin: string, calls: CallLog) =>
  composeLive(recordingPort(origin, calls), ReferenceStore.Default);

/** A port whose `ls-remote` always fails while every other call stays real. */
const lsRemoteFailingPort = (origin: string, calls: CallLog) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const base = yield* Git.GitPort;
      const impl: Git.GitPortImpl = {
        ...base,
        origin: rawOrigin,
        lsRemote: (_path, patterns) => {
          calls.lsRemote.push(patterns);
          return Effect.succeed({
            ok: false,
            rows: [],
            message: 'network is unreachable',
          });
        },
      };
      return Layer.succeed(Git.GitPort, impl);
    }),
  ).pipe(Layer.provide(Git.Default));

const failingLsRemoteLive = (origin: string, calls: CallLog) =>
  composeLive(lsRemoteFailingPort(origin, calls), ReferenceStore.Default);

const failingStore = (): ReferenceStore.Impl => ({
  list: () => Effect.succeed([]),
  names: () => Effect.succeed([]),
  entryExists: () => Effect.succeed(false),
  scan: () => Effect.succeed({ present: true, entries: [] }),
  readRaw: () =>
    Effect.fail(new ReferenceStore.StoreError({ operation: 'read', reason: 'No reference.' })),
  readOne: () =>
    Effect.fail(new ReferenceStore.StoreError({ operation: 'read', reason: 'No reference.' })),
  write: () =>
    Effect.fail(new ReferenceStore.StoreError({ operation: 'write', reason: 'simulated failure' })),
  remove: () =>
    Effect.fail(new ReferenceStore.StoreError({ operation: 'remove', reason: 'No reference.' })),
  exists: () => Effect.succeed(false),
});

const brokenStoreLive = (origin: string, calls: CallLog) =>
  composeLive(
    recordingPort(origin, calls),
    Layer.succeed(ReferenceStore.ReferenceStore, failingStore()),
  );

const URL = 'https://example.test/montflow/fixture.git';
const PURPOSE = 'Fixture repo for the lifecycle engine.';

const entry = (fields: {
  name: string;
  url?: string;
  purpose?: string;
  added?: string;
  ref?: string;
}): Reference.Reference => {
  const base = {
    name: fields.name,
    url: fields.url ?? URL,
    purpose: fields.purpose ?? PURPOSE,
    added: fields.added ?? '2026-10-26',
  };
  if (fields.ref === undefined) return Reference.Reference.make(base);
  return Reference.Reference.make({ ...base, ref: fields.ref });
};

const seed = (
  root: string,
  store: ReferenceStore.Impl,
  reference: Reference.Reference,
): Effect.Effect<void, ReferenceStore.StoreError> => store.write(root, reference, '\n# Notes\n');

Vitest.describe('GitLifecycle add', () => {
  Vitest.it.effect('adds a reference, clones through the port, and writes the entry last', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      const origin = yield* Effect.promise(makeOrigin);
      const calls = counters();
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        const result = yield* lifecycle.add(root, {
          url: URL,
          purpose: PURPOSE,
          invocation: 'mf-references',
        });
        const raw = yield* store.readRaw(root, 'fixture');
        return { result, raw };
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));

      Vitest.expect(outcome.result).toMatchObject({
        kind: 'created',
        slug: 'fixture',
        url: URL,
        message: `created fixture ${URL}`,
      });
      Vitest.expect(outcome.raw).toContain('name: fixture');
      Vitest.expect(outcome.raw).toContain(`url: ${URL}`);
      Vitest.expect(calls.clone).toEqual([URL]);
      Vitest.expect(
        yield* Effect.promise(() => fileExists(Reference.clonePath(root, 'fixture'))),
      ).toBe(true);
      Vitest.expect(
        yield* Effect.promise(() => fileExists(join(root, '.agents/references/.gitkeep'))),
      ).toBe(true);
      Vitest.expect(yield* Effect.promise(() => readOrEmpty(join(root, '.gitignore')))).toContain(
        '.agents/references',
      );

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('checks out a recorded tag on add', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      const origin = yield* Effect.promise(makeOrigin);
      const calls = counters();
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        const result = yield* lifecycle.add(root, {
          url: URL,
          purpose: PURPOSE,
          ref: 'v1',
        });
        const raw = yield* store.readRaw(root, 'fixture');
        const head = yield* Effect.promise(() =>
          git(Reference.clonePath(root, 'fixture'), ['rev-parse', 'HEAD']),
        );
        const branch = yield* Effect.promise(() =>
          git(Reference.clonePath(root, 'fixture'), ['rev-parse', '--abbrev-ref', 'HEAD']),
        );
        return { result, raw, head, branch };
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));

      Vitest.expect(outcome.result).toMatchObject({
        kind: 'created',
        ref: 'v1',
        message: `created fixture ${URL}`,
      });
      Vitest.expect(outcome.raw).toContain('ref: v1');
      Vitest.expect(outcome.head).toBe(origin.first);
      Vitest.expect(outcome.branch).toBe('HEAD');

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect(
    'refuses an ssh, scp, file, or local-path argument before the port is called',
    () =>
      Effect.gen(function* () {
        const root = yield* Effect.promise(makeWorkspace);
        const origin = yield* Effect.promise(makeOrigin);
        const calls = counters();
        const results = yield* Effect.gen(function* () {
          const lifecycle = yield* Git.GitLifecycle;
          const values = [
            'ssh://git@github.com/sst/opencode.git',
            'git@github.com:sst/opencode.git',
            'file:///tmp/opencode',
            '/tmp/opencode',
            'http://github.com/sst/opencode.git',
          ];
          const out: Array<unknown> = [];
          for (const url of values) {
            out.push(yield* lifecycle.add(root, { url, purpose: PURPOSE }));
          }
          return out;
        }).pipe(Effect.provide(cloningLive(origin.dir, calls)));

        for (const result of results) {
          Vitest.expect(result).toMatchObject({ kind: 'refused', code: 'invalid-url' });
        }
        Vitest.expect(calls.clone).toEqual([]);
        Vitest.expect(yield* Effect.promise(() => fileExists(join(root, '.agents')))).toBe(false);

        yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
        yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
      }),
  );

  Vitest.it.effect('refuses add outside a git work tree without touching a clone', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const calls = counters();
      const result = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        return yield* lifecycle.add(root, { url: URL, purpose: PURPOSE });
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));

      Vitest.expect(result).toMatchObject({ kind: 'failed', code: 'not-work-tree' });
      Vitest.expect(calls.clone).toEqual([]);
      Vitest.expect(yield* Effect.promise(() => fileExists(join(root, '.agents')))).toBe(false);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('refuses a slug collision with a different URL before cloning', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      const origin = yield* Effect.promise(makeOrigin);
      const calls = counters();
      const result = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture' }));
        return yield* lifecycle.add(root, {
          url: 'https://example.test/other/fixture.git',
          purpose: PURPOSE,
        });
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));

      Vitest.expect(result).toMatchObject({ kind: 'refused', code: 'slug-collision' });
      Vitest.expect(calls.clone).toEqual([]);
      Vitest.expect(
        yield* Effect.promise(() => fileExists(Reference.clonePath(root, 'fixture'))),
      ).toBe(false);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('routes an already-registered URL and name to update', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      const origin = yield* Effect.promise(makeOrigin);
      const calls = counters();
      const results = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture' }));
        const byUrl = yield* lifecycle.add(root, { url: URL, purpose: PURPOSE });
        const byName = yield* lifecycle.add(root, {
          url: URL,
          name: 'fixture',
          purpose: PURPOSE,
        });
        return { byUrl, byName };
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));

      Vitest.expect(results.byUrl).toMatchObject({
        kind: 'routed',
        slug: 'fixture',
        notice: `routed add -> update fixture: ${URL} is already registered as fixture`,
      });
      Vitest.expect(results.byName).toMatchObject({ kind: 'routed', slug: 'fixture' });
      if (results.byUrl.kind === 'routed') {
        Vitest.expect(results.byUrl.update).toMatchObject({ kind: 'created', slug: 'fixture' });
      }
      if (results.byName.kind === 'routed') {
        Vitest.expect(results.byName.update).toMatchObject({ kind: 'present', slug: 'fixture' });
      }
      Vitest.expect(calls.clone).toEqual([URL]);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('leaves neither a clone nor an entry when the clone fails', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      const calls = counters();
      const result = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        return yield* lifecycle.add(root, { url: URL, purpose: PURPOSE });
      }).pipe(Effect.provide(cloningLive('/tmp/mf-references-no-such-origin', calls)));

      Vitest.expect(result).toMatchObject({ kind: 'failed', code: 'clone-failure' });
      Vitest.expect(calls.clone).toEqual([URL]);
      Vitest.expect(
        yield* Effect.promise(() => fileExists(Reference.clonePath(root, 'fixture'))),
      ).toBe(false);
      Vitest.expect(
        yield* Effect.promise(() =>
          fileExists(join(root, Reference.STORE_DIR, 'fixture', Reference.ENTRY_FILE)),
        ),
      ).toBe(false);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('rolls the clone and entry back when the entry write fails', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      const origin = yield* Effect.promise(makeOrigin);
      const calls = counters();
      const result = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        return yield* lifecycle.add(root, { url: URL, purpose: PURPOSE });
      }).pipe(Effect.provide(brokenStoreLive(origin.dir, calls)));

      Vitest.expect(result).toMatchObject({ kind: 'failed', code: 'write-failure' });
      Vitest.expect(calls.clone).toEqual([URL]);
      Vitest.expect(
        yield* Effect.promise(() => fileExists(Reference.clonePath(root, 'fixture'))),
      ).toBe(false);
      Vitest.expect(
        yield* Effect.promise(() =>
          fileExists(join(root, Reference.STORE_DIR, 'fixture', Reference.ENTRY_FILE)),
        ),
      ).toBe(false);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );
  Vitest.it.effect('refuses a routed add whose --ref cannot be applied', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      const origin = yield* Effect.promise(makeOrigin);
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture' }));
        return yield* lifecycle.add(root, { url: URL, purpose: PURPOSE, ref: 'v1' });
      }).pipe(Effect.provide(cloningLive(origin.dir, counters())));

      Vitest.expect(outcome).toMatchObject({ kind: 'refused', code: 'usage' });
      if (outcome.kind !== 'refused') throw new Error('expected a refusal');
      Vitest.expect(outcome.message).toContain('--ref applies only when registering');

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('routes a re-add of a pinned entry when the ref matches or is omitted', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      const origin = yield* Effect.promise(makeOrigin);
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture', ref: 'v1' }));
        const sameRef = yield* lifecycle.add(root, { url: URL, purpose: PURPOSE, ref: 'v1' });
        const noRef = yield* lifecycle.add(root, { url: URL, purpose: PURPOSE });
        return { sameRef, noRef };
      }).pipe(Effect.provide(cloningLive(origin.dir, counters())));

      Vitest.expect(outcome.sameRef.kind).toBe('routed');
      Vitest.expect(outcome.noRef.kind).toBe('routed');

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('refuses add when an unusable entry already claims the url', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      const origin = yield* Effect.promise(makeOrigin);
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const dir = join(root, Reference.STORE_DIR, 'badslug');
        yield* Effect.promise(() => mkdir(dir, { recursive: true }));
        yield* Effect.promise(() =>
          writeFile(
            join(dir, Reference.ENTRY_FILE),
            [
              '---',
              'name: Bad Slug',
              `url: ${URL}`,
              `purpose: ${PURPOSE}`,
              'added: 2026-10-26',
              '---',
              '',
              '# Notes',
              '',
            ].join('\n'),
          ),
        );
        return yield* lifecycle.add(root, { url: URL, purpose: PURPOSE });
      }).pipe(Effect.provide(cloningLive(origin.dir, counters())));

      Vitest.expect(outcome).toMatchObject({ kind: 'refused', code: 'invalid-entry' });
      Vitest.expect(
        yield* Effect.promise(() => fileExists(join(root, Reference.STORE_DIR, 'fixture'))),
      ).toBe(false);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );
});

Vitest.describe('GitLifecycle update', () => {
  Vitest.it.effect('fast-forwards a default-branch entry and resolves by name and URL', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const clone = yield* Effect.promise(() => makeClone(root, 'fixture', origin.dir, URL));
      const second = yield* Effect.promise(() => advanceOrigin(origin.dir));
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture' }));
        const byName = yield* lifecycle.update(root, 'fixture');
        const byUrl = yield* lifecycle.update(root, URL);
        const head = yield* Effect.promise(() => git(clone, ['rev-parse', 'HEAD']));
        return { byName, byUrl, head };
      }).pipe(Effect.provide(realLive));

      Vitest.expect(outcome.byName).toMatchObject({ kind: 'updated', slug: 'fixture' });
      Vitest.expect(outcome.byUrl).toMatchObject({ kind: 'present', slug: 'fixture' });
      Vitest.expect(outcome.head).toBe(second);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('checks out a recorded tag and a recorded commit detached', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const second = yield* Effect.promise(() => advanceOrigin(origin.dir));
      const clone = yield* Effect.promise(() => makeClone(root, 'fixture', origin.dir, URL));
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture', ref: 'v1' }));
        const tagResult = yield* lifecycle.update(root, 'fixture');
        const tagHead = yield* Effect.promise(() => git(clone, ['rev-parse', 'HEAD']));
        yield* store.write(root, entry({ name: 'fixture', ref: origin.first }), '\n# Notes\n');
        const commitResult = yield* lifecycle.update(root, 'fixture');
        const commitHead = yield* Effect.promise(() => git(clone, ['rev-parse', 'HEAD']));
        const branch = yield* Effect.promise(() =>
          git(clone, ['rev-parse', '--abbrev-ref', 'HEAD']),
        );
        return { tagResult, tagHead, commitResult, commitHead, branch };
      }).pipe(Effect.provide(realLive));

      Vitest.expect(second).not.toBe(origin.first);
      Vitest.expect(outcome.tagResult).toMatchObject({ kind: 'updated' });
      Vitest.expect(outcome.tagHead).toBe(origin.first);
      Vitest.expect(outcome.commitResult).toMatchObject({ kind: 'present' });
      Vitest.expect(outcome.commitHead).toBe(origin.first);
      Vitest.expect(outcome.branch).toBe('HEAD');

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('refuses a dirty worktree unless forced, and force discards changes', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const clone = yield* Effect.promise(() => makeClone(root, 'fixture', origin.dir, URL));
      yield* Effect.promise(() => writeFile(join(clone, 'file.txt'), 'local edit\n'));
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture' }));
        const refused = yield* lifecycle.update(root, 'fixture');
        const forced = yield* lifecycle.update(root, 'fixture', { force: true });
        const content = yield* Effect.promise(() => readFile(join(clone, 'file.txt'), 'utf8'));
        return { refused, forced, content };
      }).pipe(Effect.provide(realLive));

      Vitest.expect(outcome.refused).toMatchObject({ kind: 'refused', code: 'dirty' });
      Vitest.expect(outcome.forced).toMatchObject({ kind: 'present' });
      Vitest.expect(outcome.content).toBe('one\n');

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('refuses a foreign origin and an unknown URL or name', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const clone = yield* Effect.promise(() =>
        makeClone(root, 'fixture', origin.dir, 'https://example.test/other.git'),
      );
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture' }));
        const foreign = yield* lifecycle.update(root, 'fixture');
        const unknownUrl = yield* lifecycle.update(
          root,
          'https://example.test/montflow/absent.git',
        );
        const unknownName = yield* lifecycle.update(root, 'absent');
        const head = yield* Effect.promise(() => git(clone, ['rev-parse', 'HEAD']));
        return { foreign, unknownUrl, unknownName, head };
      }).pipe(Effect.provide(realLive));

      Vitest.expect(outcome.foreign).toMatchObject({ kind: 'refused', code: 'foreign-origin' });
      Vitest.expect(outcome.unknownUrl).toMatchObject({
        kind: 'refused',
        code: 'unknown-url',
        message:
          "refused: unknown url https://example.test/montflow/absent.git; run '/mf-references add https://example.test/montflow/absent.git' first",
      });
      Vitest.expect(outcome.unknownName).toMatchObject({
        kind: 'refused',
        code: 'unknown-reference',
      });
      Vitest.expect(outcome.head).toBe(origin.first);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('refuses a moved tag without moving HEAD', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const clone = yield* Effect.promise(() => makeClone(root, 'fixture', origin.dir, URL));
      const second = yield* Effect.promise(() => advanceOrigin(origin.dir));
      yield* Effect.promise(() => git(origin.dir, ['tag', '-f', 'v1', second]));
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture', ref: 'v1' }));
        const result = yield* lifecycle.update(root, 'fixture');
        const head = yield* Effect.promise(() => git(clone, ['rev-parse', 'HEAD']));
        return { result, head };
      }).pipe(Effect.provide(realLive));

      Vitest.expect(outcome.result).toMatchObject({ kind: 'refused', code: 'tag-moved' });
      if (outcome.result.kind === 'refused' || outcome.result.kind === 'failed') {
        Vitest.expect(outcome.result.message).toContain(`now resolves to ${second.slice(0, 7)}`);
        Vitest.expect(outcome.result.message).toContain(
          `the pin records ${origin.first.slice(0, 7)}`,
        );
      }
      Vitest.expect(outcome.head).toBe(origin.first);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('leaves the clone unchanged when a fetch fails', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const clone = yield* Effect.promise(() => makeClone(root, 'fixture', origin.dir, URL, false));
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture' }));
        const result = yield* lifecycle.update(root, 'fixture');
        const head = yield* Effect.promise(() => git(clone, ['rev-parse', 'HEAD']));
        const dirty = yield* Effect.promise(() => git(clone, ['status', '--porcelain']));
        return { result, head, dirty };
      }).pipe(Effect.provide(realLive));

      Vitest.expect(outcome.result).toMatchObject({ kind: 'failed', code: 'fetch-failure' });
      Vitest.expect(outcome.head).toBe(origin.first);
      Vitest.expect(outcome.dirty).toBe('');

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );
  Vitest.it.effect('refuses a registered-but-unusable entry by name and by URL', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'badpurpose', purpose: 'no terminal dot' }));
        const byName = yield* lifecycle.update(root, 'badpurpose');
        const byUrl = yield* lifecycle.update(root, URL);
        return { byName, byUrl };
      }).pipe(Effect.provide(cloningLive(origin.dir, counters())));

      Vitest.expect(outcome.byName).toMatchObject({ kind: 'refused', code: 'invalid-entry' });
      Vitest.expect(outcome.byUrl).toMatchObject({ kind: 'refused', code: 'invalid-entry' });

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );
});

Vitest.describe('GitLifecycle sync', () => {
  Vitest.it.effect('repairs a stale origin/HEAD after an upstream default-branch rename', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      yield* Effect.promise(() => makeClone(root, 'fixture', origin.dir, URL));
      yield* Effect.promise(() => git(origin.dir, ['branch', '-m', 'main', 'trunk']));

      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture' }));
        return yield* lifecycle.sync(root, { name: 'fixture' });
      }).pipe(Effect.provide(realLive));

      if (!('entries' in outcome)) throw new Error('expected a sync report');
      Vitest.expect(outcome.entries[0]?.kind).not.toBe('skipped');
      Vitest.expect(outcome.entries[0]?.kind).not.toBe('failed');
      Vitest.expect(outcome.failed).toBe(false);

      const updated = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        return yield* lifecycle.update(root, 'fixture');
      }).pipe(Effect.provide(realLive));
      Vitest.expect(updated.kind).not.toBe('failed');

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('sync --all clones every missing entry and changes no registry file', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const calls = counters();
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(
          root,
          store,
          entry({ name: 'alpha', url: 'https://example.test/montflow/alpha.git' }),
        );
        yield* seed(
          root,
          store,
          entry({ name: 'beta', url: 'https://example.test/montflow/beta.git' }),
        );
        const before = yield* store.readRaw(root, 'alpha');
        const result = yield* lifecycle.sync(root, { all: true });
        const after = yield* store.readRaw(root, 'alpha');
        return { result, before, after };
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));

      Vitest.expect(outcome.result).toMatchObject({ failed: false });
      if (!('entries' in outcome.result)) throw new Error('expected a sync report');
      Vitest.expect(outcome.result.entries.map((one) => one.kind)).toEqual(['created', 'created']);
      Vitest.expect(outcome.before).toBe(outcome.after);
      Vitest.expect(calls.clone).toHaveLength(2);
      Vitest.expect(
        yield* Effect.promise(() => fileExists(Reference.clonePath(root, 'alpha'))),
      ).toBe(true);
      Vitest.expect(
        yield* Effect.promise(() => fileExists(Reference.clonePath(root, 'beta'))),
      ).toBe(true);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('sync with one name touches only that entry', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const calls = counters();
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(
          root,
          store,
          entry({ name: 'alpha', url: 'https://example.test/montflow/alpha.git' }),
        );
        yield* seed(
          root,
          store,
          entry({ name: 'beta', url: 'https://example.test/montflow/beta.git' }),
        );
        return yield* lifecycle.sync(root, { name: 'beta' });
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));

      Vitest.expect(outcome).toMatchObject({ failed: false });
      if (!('entries' in outcome)) throw new Error('expected a sync report');
      Vitest.expect(outcome.entries).toHaveLength(1);
      Vitest.expect(outcome.entries[0]).toMatchObject({ kind: 'created', slug: 'beta' });
      Vitest.expect(
        yield* Effect.promise(() => fileExists(Reference.clonePath(root, 'alpha'))),
      ).toBe(false);
      Vitest.expect(
        yield* Effect.promise(() => fileExists(Reference.clonePath(root, 'beta'))),
      ).toBe(true);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('skips a dirty clone and never writes the registry', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const clone = yield* Effect.promise(() => makeClone(root, 'fixture', origin.dir, URL));
      yield* Effect.promise(() => writeFile(join(clone, 'scratch.txt'), 'scratch\n'));
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture' }));
        const before = yield* store.readRaw(root, 'fixture');
        const result = yield* lifecycle.sync(root, { all: true });
        const after = yield* store.readRaw(root, 'fixture');
        return { result, before, after };
      }).pipe(Effect.provide(realLive));

      Vitest.expect(outcome.result).toMatchObject({ failed: true });
      if (!('entries' in outcome.result)) throw new Error('expected a sync report');
      Vitest.expect(outcome.result.entries[0]).toMatchObject({ kind: 'skipped', slug: 'fixture' });
      Vitest.expect(outcome.before).toBe(outcome.after);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('refuses an entry whose url is not https before any clone runs', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const calls = counters();
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'local', url: '/tmp/not-a-repo' }));
        return yield* lifecycle.sync(root, { all: true });
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));

      if (!('entries' in outcome)) throw new Error('expected a sync report');
      Vitest.expect(outcome.failed).toBe(true);
      Vitest.expect(outcome.entries[0]).toMatchObject({ kind: 'failed', slug: 'local' });
      Vitest.expect(outcome.entries[0]?.message).toContain('url:');
      Vitest.expect(calls.clone).toEqual([]);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('sync <name> ignores unusable siblings', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'alpha' }));
        yield* seed(root, store, entry({ name: 'broken', url: '/tmp/not-a-repo' }));
        return yield* lifecycle.sync(root, { name: 'alpha' });
      }).pipe(Effect.provide(cloningLive(origin.dir, counters())));

      if (!('entries' in outcome)) throw new Error('expected a sync report');
      Vitest.expect(outcome.entries).toHaveLength(1);
      Vitest.expect(outcome.entries[0]).toMatchObject({ kind: 'created', slug: 'alpha' });
      Vitest.expect(outcome.failed).toBe(false);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('refuses every verb when the store root is missing', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const synced = yield* lifecycle.sync(root, { all: true });
        const status = yield* lifecycle.status(root, {});
        const updated = yield* lifecycle.update(root, 'absent');
        return { synced, status, updated };
      }).pipe(Effect.provide(cloningLive(origin.dir, counters())));

      for (const result of [outcome.synced, outcome.status, outcome.updated]) {
        Vitest.expect(result).toMatchObject({ kind: 'refused', code: 'store-missing' });
      }

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );
});

Vitest.describe('GitLifecycle status', () => {
  Vitest.it.effect('a named status run ignores unusable siblings', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'alpha' }));
        yield* seed(root, store, entry({ name: 'broken', url: '/tmp/not-a-repo' }));
        return yield* lifecycle.status(root, { name: 'alpha' });
      }).pipe(Effect.provide(cloningLive(origin.dir, counters())));

      if (!('rows' in outcome)) throw new Error('expected a status report');
      Vitest.expect(outcome.rows).toHaveLength(1);
      Vitest.expect(outcome.summary).toContain('total=1');
      Vitest.expect(outcome.summary).toContain('invalid=0');

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('reports an unusable entry as an invalid status row', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'broken', url: '/tmp/not-a-repo' }));
        return yield* lifecycle.status(root, {});
      }).pipe(Effect.provide(cloningLive(origin.dir, counters())));

      if (!('rows' in outcome)) throw new Error('expected a status report');
      Vitest.expect(outcome.refused).toBe(true);
      Vitest.expect(outcome.rows[0]).toMatchObject({ slug: 'broken', state: 'invalid' });
      Vitest.expect(outcome.rows[0]?.message).toContain('url:');
      Vitest.expect(outcome.summary).toContain('invalid=1');

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('rejects an entry whose name differs from its directory', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const dir = join(root, Reference.STORE_DIR, 'wrongdir');
        yield* Effect.promise(() => mkdir(dir, { recursive: true }));
        yield* Effect.promise(() =>
          writeFile(
            join(dir, Reference.ENTRY_FILE),
            Reference.encodeReferenceFile({
              reference: entry({ name: 'alpha2' }),
              body: '\n# Notes\n',
            }),
          ),
        );
        return yield* lifecycle.status(root, {});
      }).pipe(Effect.provide(cloningLive(origin.dir, counters())));

      if (!('rows' in outcome)) throw new Error('expected a status report');
      Vitest.expect(outcome.rows[0]).toMatchObject({ slug: 'wrongdir', state: 'invalid' });
      Vitest.expect(outcome.rows[0]?.message).toContain('does not match directory');
      Vitest.expect(outcome.summary).toContain('invalid=1');

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('reports missing, present, dirty, and ref-mismatch offline', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      yield* Effect.promise(() => makeClone(root, 'present', origin.dir, URL));
      const dirtyClone = yield* Effect.promise(() => makeClone(root, 'dirty', origin.dir, URL));
      yield* Effect.promise(() => writeFile(join(dirtyClone, 'scratch.txt'), 'scratch\n'));
      const mismatchClone = yield* Effect.promise(() =>
        makeClone(root, 'mismatch', origin.dir, URL),
      );
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'missing' }));
        yield* seed(root, store, entry({ name: 'present' }));
        yield* seed(root, store, entry({ name: 'dirty' }));
        yield* seed(root, store, entry({ name: 'mismatch', ref: origin.first }));
        yield* Effect.promise(() => writeFile(join(mismatchClone, 'file.txt'), 'changed\n'));
        yield* Effect.promise(() => git(mismatchClone, ['commit', '-am', 'local change']));
        const result = yield* lifecycle.status(root);
        return result;
      }).pipe(Effect.provide(realLive));

      if (!('rows' in outcome)) throw new Error('expected a status report');
      const bySlug = new Map(outcome.rows.map((row) => [row.slug, row]));
      Vitest.expect(bySlug.get('missing')).toMatchObject({
        state: 'missing',
        message: 'missing missing',
      });
      Vitest.expect(bySlug.get('present')).toMatchObject({
        state: 'present',
        message: 'present present',
      });
      Vitest.expect(bySlug.get('dirty')).toMatchObject({
        state: 'dirty',
        message: 'dirty dirty files=1',
      });
      Vitest.expect(bySlug.get('mismatch')).toMatchObject({ state: 'ref-mismatch' });
      Vitest.expect(outcome.summary).toBe(
        'summary total=4 missing=1 present=1 dirty=1 ref-mismatch=1 foreign=0 invalid=0',
      );

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('status --fetch reports behind then ahead and never fetches offline', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const clone = yield* Effect.promise(() => makeClone(root, 'fixture', origin.dir, URL));
      const second = yield* Effect.promise(() => advanceOrigin(origin.dir));
      const calls = counters();
      const offline = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture' }));
        return yield* lifecycle.status(root);
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));
      if (!('rows' in offline)) throw new Error('expected a status report');
      Vitest.expect(offline.rows[0]).toMatchObject({
        state: 'present',
        message: 'present fixture',
      });
      Vitest.expect(calls.fetch).toEqual([]);

      const fetched = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        return yield* lifecycle.status(root, { fetch: true });
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));
      if (!('rows' in fetched)) throw new Error('expected a status report');
      Vitest.expect(fetched.rows[0]).toMatchObject({
        state: 'present',
        behind: 1,
        ahead: 0,
        message: 'present fixture behind=1',
      });

      yield* Effect.promise(() => writeFile(join(clone, 'local.txt'), 'local\n'));
      yield* Effect.promise(() => git(clone, ['add', 'local.txt']));
      yield* Effect.promise(() => git(clone, ['commit', '-m', 'local']));
      const both = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        return yield* lifecycle.status(root, { fetch: true });
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));
      if (!('rows' in both)) throw new Error('expected a status report');
      Vitest.expect(both.rows[0]).toMatchObject({
        state: 'present',
        behind: 1,
        ahead: 1,
        message: 'present fixture behind=1 ahead=1',
      });
      Vitest.expect(second.length).toBe(40);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('status --fetch reports a moved tag as ref-mismatch with remote=', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      yield* Effect.promise(() => makeClone(root, 'fixture', origin.dir, URL));
      const second = yield* Effect.promise(() => advanceOrigin(origin.dir));
      yield* Effect.promise(() => git(origin.dir, ['tag', '-f', 'v1', second]));
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture', ref: 'v1' }));
        return yield* lifecycle.status(root, { fetch: true });
      }).pipe(Effect.provide(realLive));

      if (!('rows' in outcome)) throw new Error('expected a status report');
      Vitest.expect(outcome.rows[0]).toMatchObject({
        state: 'ref-mismatch',
        message: `ref-mismatch fixture ref=v1 expected=${origin.first.slice(0, 7)} remote=${second.slice(0, 7)}`,
      });

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('refuses a foreign clone path in status', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      yield* Effect.promise(() =>
        makeClone(root, 'fixture', origin.dir, 'https://example.test/other.git'),
      );
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture' }));
        return yield* lifecycle.status(root);
      }).pipe(Effect.provide(realLive));

      if (!('rows' in outcome)) throw new Error('expected a status report');
      Vitest.expect(outcome.refused).toBe(true);
      Vitest.expect(outcome.rows[0]).toMatchObject({ state: 'foreign', refused: true });
      Vitest.expect(outcome.summary).toBe(
        'summary total=1 missing=0 present=0 dirty=0 ref-mismatch=0 foreign=1 invalid=0',
      );

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );
});

Vitest.describe('GitLifecycle pinned refs', () => {
  Vitest.it.effect('pins a tag whose name contains a slash', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      yield* Effect.promise(() => git(origin.dir, ['tag', 'release/v1']));
      yield* Effect.promise(() => makeClone(root, 'fixture', origin.dir, URL));
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture', ref: 'release/v1' }));
        return yield* lifecycle.update(root, 'fixture');
      }).pipe(Effect.provide(realLive));

      Vitest.expect(outcome.kind).toBe('present');

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('status --fetch reflects the post-fetch branch pin', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      yield* Effect.promise(() => makeClone(root, 'fixture', origin.dir, URL));
      yield* Effect.promise(async () => {
        await git(origin.dir, ['commit', '--allow-empty', '-m', 'advance']);
      });
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture', ref: 'main' }));
        return yield* lifecycle.status(root, { fetch: true });
      }).pipe(Effect.provide(realLive));

      if (!('rows' in outcome)) throw new Error('expected a status report');
      Vitest.expect(outcome.rows[0]?.state).toBe('ref-mismatch');
      Vitest.expect(outcome.rows[0]?.message).toContain('head=');

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('resolves an annotated tag from its peeled remote row', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const calls = counters();
      const clone = yield* Effect.promise(() => makeClone(root, 'fixture', origin.dir, URL));
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture', ref: 'v2' }));
        const result = yield* lifecycle.update(root, 'fixture');
        const head = yield* Effect.promise(() => git(clone, ['rev-parse', 'HEAD']));
        return { result, head };
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));

      Vitest.expect(outcome.result).toMatchObject({ kind: 'present', slug: 'fixture' });
      Vitest.expect(outcome.head).toBe(origin.first);
      Vitest.expect(calls.lsRemote).toEqual([['refs/tags/v2', 'refs/tags/v2^{}']]);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('accepts a literal refs/tags/v1 pin and applies the prefix exactly once', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const calls = counters();
      yield* Effect.promise(() => advanceOrigin(origin.dir));
      const clone = yield* Effect.promise(() => makeClone(root, 'fixture', origin.dir, URL));
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture', ref: 'refs/tags/v1' }));
        const result = yield* lifecycle.update(root, 'fixture');
        const head = yield* Effect.promise(() => git(clone, ['rev-parse', 'HEAD']));
        return { result, head };
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));

      Vitest.expect(outcome.result).toMatchObject({ kind: 'updated' });
      Vitest.expect(outcome.head).toBe(origin.first);
      Vitest.expect(calls.lsRemote).toEqual([['refs/tags/v1', 'refs/tags/v1^{}']]);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('never calls ls-remote for a commit pin', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const calls = counters();
      yield* Effect.promise(() => makeClone(root, 'fixture', origin.dir, URL));
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture', ref: origin.first }));
        return yield* lifecycle.update(root, 'fixture');
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));

      Vitest.expect(outcome).toMatchObject({ kind: 'present', slug: 'fixture' });
      Vitest.expect(calls.lsRemote).toEqual([]);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('reports a deleted upstream tag as unresolvable, not moved', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const calls = counters();
      const clone = yield* Effect.promise(() => makeClone(root, 'fixture', origin.dir, URL));
      yield* Effect.promise(() => git(origin.dir, ['tag', '-d', 'v1']));
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture', ref: 'v1' }));
        const result = yield* lifecycle.update(root, 'fixture');
        const head = yield* Effect.promise(() => git(clone, ['rev-parse', 'HEAD']));
        return { result, head };
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));

      Vitest.expect(outcome.result).toMatchObject({ kind: 'refused', code: 'ref-unresolvable' });
      Vitest.expect(outcome.head).toBe(origin.first);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );
});

Vitest.describe('GitLifecycle force failure', () => {
  Vitest.it.effect('reports a clean failure instead of claiming a forced update', () =>
    Effect.gen(function* () {
      if (process.platform === 'win32' || process.getuid?.() === 0) return;
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const clone = yield* Effect.promise(() => makeClone(root, 'fixture', origin.dir, URL));
      yield* Effect.promise(() => writeFile(join(clone, 'file.txt'), 'local edit\n'));
      const locked = join(clone, 'locked');
      yield* Effect.promise(() => mkdir(locked, { recursive: true }));
      yield* Effect.promise(() => writeFile(join(locked, 'x'), 'x\n'));
      yield* Effect.promise(() => chmod(locked, 0o555));

      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture' }));
        return yield* lifecycle.update(root, 'fixture', { force: true });
      }).pipe(Effect.provide(realLive));

      Vitest.expect(outcome).toMatchObject({ kind: 'failed', code: 'clean-failure' });
      if (outcome.kind === 'failed') {
        Vitest.expect(outcome.message).toContain('failed: fixture clean:');
      }
      Vitest.expect(
        yield* Effect.promise(() =>
          git(clone, ['status', '--porcelain', '--untracked-files=normal']),
        ),
      ).not.toBe('');

      yield* Effect.promise(() => chmod(locked, 0o755));
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );
});

Vitest.describe('GitLifecycle status --fetch failures', () => {
  Vitest.it.effect('keeps the last-known row and attaches the ls-remote failure', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const calls = counters();
      yield* Effect.promise(() => makeClone(root, 'fixture', origin.dir, URL));
      const outcome = yield* Effect.gen(function* () {
        const lifecycle = yield* Git.GitLifecycle;
        const store = yield* ReferenceStore.ReferenceStore;
        yield* seed(root, store, entry({ name: 'fixture', ref: 'v1' }));
        return yield* lifecycle.status(root, { fetch: true });
      }).pipe(Effect.provide(failingLsRemoteLive(origin.dir, calls)));

      if (!('rows' in outcome)) throw new Error('expected a status report');
      Vitest.expect(outcome.refused).toBe(true);
      Vitest.expect(outcome.rows[0]).toMatchObject({
        state: 'present',
        message: 'present fixture',
        failure: {
          kind: 'failed',
          code: 'ls-remote-failure',
          message: 'failed fixture ls-remote: network is unreachable',
        },
      });
      Vitest.expect(calls.lsRemote).toEqual([['refs/tags/v1', 'refs/tags/v1^{}']]);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
    }),
  );
});
