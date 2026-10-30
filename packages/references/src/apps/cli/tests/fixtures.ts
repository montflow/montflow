import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import type { FileSystem, Path } from 'effect';
import { CloneProbe, Git, Reference, ReferenceStore } from '../../../index.js';

/** Run git in `cwd`, rejecting on a non-zero exit. Tests may import node:* directly. */
export const git = (cwd: string, args: ReadonlyArray<string>): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile('git', [...args], { cwd }, (error, stdout, stderr) => {
      if (error === null) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(stderr.trim() || error.message));
    });
  });

export const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-references-cli-'));

/** One upstream repository with a first commit and two tag spellings. */
export interface Origin {
  readonly dir: string;
  readonly first: string;
}

export const makeOrigin = async (): Promise<Origin> => {
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

/** A workspace root that is a git work tree, as `add` requires. */
export const makeWorkspace = async (): Promise<string> => {
  const root = await freshRoot();
  await git(root, ['init', '-b', 'main']);
  await git(root, ['config', 'user.email', 'test@example.com']);
  await git(root, ['config', 'user.name', 'Test']);
  await writeFile(join(root, 'workspace.txt'), 'workspace\n');
  await git(root, ['add', 'workspace.txt']);
  await git(root, ['commit', '-m', 'workspace']);
  return root;
};

/** Add one commit to an origin and return its id. */
let advanceCounter = 0;
export const advanceOrigin = async (dir: string): Promise<string> => {
  advanceCounter += 1;
  await writeFile(join(dir, 'file.txt'), `${advanceCounter}\n`);
  await git(dir, ['add', 'file.txt']);
  await git(dir, ['commit', '-m', 'advance']);
  return git(dir, ['rev-parse', 'HEAD']);
};

/** Clone `origin` into the derived path, then give it the entry's https origin. */
export const makeClone = async (
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

export const URL = 'https://example.test/montflow/fixture.git';
export const PURPOSE = 'Fixture repo for the CLI engine.';

/** One entry's fields, with defaults that pass verification. */
export interface EntryFields {
  readonly name: string;
  readonly url?: string;
  readonly purpose?: string;
  readonly added?: string;
  readonly ref?: string;
}

export const entry = (fields: EntryFields): Reference.Reference => {
  const base = {
    name: fields.name,
    url: fields.url ?? URL,
    purpose: fields.purpose ?? PURPOSE,
    added: fields.added ?? '2026-10-26',
  };
  if (fields.ref === undefined) return Reference.Reference.make(base);
  return Reference.Reference.make({ ...base, ref: fields.ref });
};

/** Write one valid `REFERENCE.md` without going through the store service. */
export const seedEntry = async (
  root: string,
  fields: EntryFields,
): Promise<Reference.Reference> => {
  const reference = entry(fields);
  const dir = join(root, Reference.STORE_DIR, reference.name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, Reference.ENTRY_FILE),
    Reference.encodeReferenceFile({ reference, body: '\n# Notes\n' }),
  );
  return reference;
};

/** Create the store directory without an entry. */
export const seedStoreRoot = async (root: string): Promise<void> => {
  await mkdir(join(root, Reference.STORE_DIR), { recursive: true });
};

export const readOrEmpty = async (path: string): Promise<string> => {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
};

export const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

export interface CallLog {
  readonly clone: Array<string>;
  readonly fetch: Array<string>;
}

export const counters = (): CallLog => ({ clone: [], fetch: [] });

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

const rawOriginPort = Layer.unwrap(
  Effect.gen(function* () {
    const base = yield* Git.GitPort;
    const impl: Git.GitPortImpl = { ...base, origin: rawOrigin };
    return Layer.succeed(Git.GitPort, impl);
  }),
).pipe(Layer.provide(Git.Default));

/** A recording port that maps every https clone onto one local fixture. */
export const recordingPort = (origin: string, calls: CallLog) =>
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
      };
      return Layer.succeed(Git.GitPort, impl);
    }),
  ).pipe(Layer.provide(Git.Default));

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

/** Real filesystem and git, with the raw-origin test override. */
export const realLive = composeLive(rawOriginPort, ReferenceStore.Default);

/** Real filesystem, with every https clone mapped onto a local fixture. */
export const cloningLive = (origin: string, calls: CallLog) =>
  composeLive(recordingPort(origin, calls), ReferenceStore.Default);
