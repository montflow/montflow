import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import { Reference } from '../../../index.js';
import * as Slash from '../slash.apps.module.js';
import {
  PURPOSE,
  URL,
  freshRoot,
  makeClone,
  makeOrigin,
  makeWorkspace,
  realLive,
  seedEntry,
  seedStoreRoot,
} from './fixtures.js';

const recordingUi = (messages: Array<string>): Slash.CliUi => ({
  notify: (message) => messages.push(message),
});

const cleanup = (root: string): Effect.Effect<void> =>
  Effect.promise(async () => {
    await rm(root, { recursive: true, force: true });
  });

const flip = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<E, A, R> =>
  effect.pipe(Effect.flip);

Vitest.describe('/mf-references parser', () => {
  Vitest.it('parses every verb with the binary flag set', () => {
    Vitest.expect(Slash.parseCliArgs('doctor --check --human --verbose --dir /ws')).toEqual({
      kind: 'Doctor',
      check: true,
      human: true,
      verbose: true,
      dir: '/ws',
    });
    Vitest.expect(
      Slash.parseCliArgs('list --status installed --human --verbose --dir /ws'),
    ).toEqual({
      kind: 'List',
      status: 'installed',
      human: true,
      verbose: true,
      dir: '/ws',
    });
    Vitest.expect(Slash.parseCliArgs('show alpha --dir /ws')).toEqual({
      kind: 'Show',
      name: 'alpha',
      dir: '/ws',
    });
    Vitest.expect(Slash.parseCliArgs('verify alpha --clones --human --verbose')).toEqual({
      kind: 'Verify',
      name: 'alpha',
      all: false,
      clones: true,
      human: true,
      verbose: true,
      dir: undefined,
    });
    Vitest.expect(Slash.parseCliArgs('verify --all')).toMatchObject({ kind: 'Verify', all: true });
    Vitest.expect(
      Slash.parseCliArgs(
        'add "https://example.test/owner/alpha.git" --name alpha --ref v1 --purpose "One sentence."',
      ),
    ).toEqual({
      kind: 'Add',
      url: 'https://example.test/owner/alpha.git',
      name: 'alpha',
      ref: 'v1',
      purpose: 'One sentence.',
      human: false,
      verbose: false,
      dir: undefined,
    });
    Vitest.expect(Slash.parseCliArgs('update alpha --force')).toMatchObject({
      kind: 'Update',
      target: 'alpha',
      all: false,
      force: true,
    });
    Vitest.expect(Slash.parseCliArgs('update --all')).toMatchObject({ kind: 'Update', all: true });
    Vitest.expect(Slash.parseCliArgs('sync alpha')).toMatchObject({ kind: 'Sync', name: 'alpha' });
    Vitest.expect(Slash.parseCliArgs('sync --all')).toMatchObject({ kind: 'Sync', all: true });
    Vitest.expect(Slash.parseCliArgs('status alpha --fetch')).toMatchObject({
      kind: 'Status',
      name: 'alpha',
      fetch: true,
    });
    Vitest.expect(Slash.parseCliArgs('status')).toMatchObject({ kind: 'Status', name: undefined });
    Vitest.expect(Slash.parseCliArgs('remove alpha --keep-clone')).toMatchObject({
      kind: 'Remove',
      name: 'alpha',
      keepClone: true,
    });
  });

  Vitest.it('does not let a boolean flag swallow the positional argument', () => {
    Vitest.expect(Slash.parseCliArgs('verify --clones alpha')).toMatchObject({
      kind: 'Verify',
      name: 'alpha',
      clones: true,
    });
    Vitest.expect(Slash.parseCliArgs('remove --keep-clone alpha')).toMatchObject({
      kind: 'Remove',
      name: 'alpha',
      keepClone: true,
    });
    Vitest.expect(Slash.parseCliArgs('show --dir /ws alpha')).toEqual({
      kind: 'Show',
      name: 'alpha',
      dir: '/ws',
    });
  });

  Vitest.it('keeps an explicitly empty value as present, like the binary', () => {
    Vitest.expect(
      Slash.parseCliArgs('add "https://example.test/a/b.git" --purpose ""'),
    ).toMatchObject({ kind: 'Add', purpose: '' });
    Vitest.expect(Slash.parseCliArgs('list --status ""')).toMatchObject({
      kind: 'List',
      status: '',
    });
    Vitest.expect(Slash.parseCliArgs('show alpha --dir ""')).toMatchObject({
      kind: 'Show',
      name: 'alpha',
      dir: '',
    });
    Vitest.expect(Slash.tokenize('add x --purpose ""')).toEqual(['add', 'x', '--purpose', '']);
  });

  Vitest.it('refuses a string flag with no value instead of treating it as absent', () => {
    for (const args of [
      'list --status',
      'status --dir',
      'add https://example.test/o/n.git --purpose',
      'add https://example.test/o/n.git --ref',
    ]) {
      Vitest.expect(Slash.parseCliArgs(args)).toMatchObject({
        kind: 'Usage',
        message: `usage: missing value for flag '${args.slice(args.lastIndexOf('--'))}'`,
      });
    }
    Vitest.expect(Slash.parseCliArgs('list --status=missing')).toMatchObject({ kind: 'List' });
    Vitest.expect(Slash.parseCliArgs('verify --clones alpha')).toMatchObject({
      kind: 'Verify',
      name: 'alpha',
      clones: true,
    });
  });

  Vitest.it('parses boolean flag values the same way the binary does', () => {
    Vitest.expect(Slash.parseCliArgs('doctor --check=false')).toMatchObject({
      kind: 'Doctor',
      check: false,
    });
    Vitest.expect(Slash.parseCliArgs('doctor --check=true')).toMatchObject({
      kind: 'Doctor',
      check: true,
    });
    Vitest.expect(Slash.parseCliArgs('verify --clones=false')).toMatchObject({
      kind: 'Verify',
      clones: false,
    });
    Vitest.expect(Slash.parseCliArgs('update alpha --force=false')).toMatchObject({
      kind: 'Update',
      target: 'alpha',
      force: false,
    });
    Vitest.expect(Slash.parseCliArgs('remove alpha --keep-clone=false')).toMatchObject({
      kind: 'Remove',
      keepClone: false,
    });
    Vitest.expect(Slash.parseCliArgs('sync alpha --all=false')).toMatchObject({
      kind: 'Sync',
      name: 'alpha',
      all: false,
    });
    Vitest.expect(Slash.parseCliArgs('doctor --check=maybe')).toMatchObject({
      kind: 'Usage',
      message: "usage: invalid value 'maybe' for flag '--check'",
    });
    Vitest.expect(Slash.parseCliArgs('doctor --check=TRUE')).toMatchObject({ kind: 'Usage' });
    Vitest.expect(Slash.parseCliArgs('doctor --check=yes')).toMatchObject({ check: true });
    Vitest.expect(Slash.parseCliArgs('doctor --check=1')).toMatchObject({ check: true });
    Vitest.expect(Slash.parseCliArgs('doctor --check=off')).toMatchObject({ check: false });
    Vitest.expect(Slash.parseCliArgs('doctor --check=0')).toMatchObject({ check: false });
    Vitest.expect(Slash.parseCliArgs('doctor --check false')).toMatchObject({ check: false });
    Vitest.expect(Slash.parseCliArgs('doctor --check yes')).toMatchObject({ check: true });
    Vitest.expect(Slash.parseCliArgs('doctor --check maybe')).toMatchObject({ kind: 'Usage' });
    Vitest.expect(Slash.parseCliArgs('doctor --no-check')).toMatchObject({ check: false });
    Vitest.expect(Slash.parseCliArgs('doctor --no-check=false')).toMatchObject({ kind: 'Usage' });
    Vitest.expect(Slash.parseCliArgs('doctor --check --check=false')).toMatchObject({
      check: true,
    });
    Vitest.expect(Slash.parseCliArgs('doctor --check=false --check')).toMatchObject({
      check: false,
    });
    Vitest.expect(Slash.parseCliArgs('doctor --no-check --check')).toMatchObject({ check: false });
    Vitest.expect(Slash.parseCliArgs('doctor --check --no-check')).toMatchObject({ check: true });
    Vitest.expect(Slash.parseCliArgs('update alpha --force --force=false')).toMatchObject({
      kind: 'Update',
      force: true,
    });
    Vitest.expect(Slash.parseCliArgs('update alpha --force=false --force')).toMatchObject({
      kind: 'Update',
      force: false,
    });
    Vitest.expect(Slash.parseCliArgs('list --dir /a --dir /b')).toMatchObject({ dir: '/a' });
    Vitest.expect(Slash.parseCliArgs('verify --clones false')).toMatchObject({
      kind: 'Verify',
      clones: false,
      name: undefined,
    });
  });

  Vitest.it('enforces exactly one positional for show and remove', () => {
    Vitest.expect(Slash.parseCliArgs('show alpha beta')).toMatchObject({ kind: 'Usage' });
    Vitest.expect(Slash.parseCliArgs('remove alpha beta')).toMatchObject({ kind: 'Usage' });
  });

  Vitest.it('reports usage errors for unknown flags, missing names, and bad selection', () => {
    Vitest.expect(Slash.parseCliArgs('doctor --nope')).toMatchObject({ kind: 'Usage' });
    Vitest.expect(Slash.parseCliArgs('doctor alpha')).toMatchObject({ kind: 'Usage' });
    Vitest.expect(Slash.parseCliArgs('list --nope')).toMatchObject({ kind: 'Usage' });
    Vitest.expect(Slash.parseCliArgs('show alpha --human')).toMatchObject({ kind: 'Usage' });
    Vitest.expect(Slash.parseCliArgs('show')).toMatchObject({ kind: 'Usage' });
    Vitest.expect(Slash.parseCliArgs('add')).toMatchObject({ kind: 'Usage' });
    Vitest.expect(Slash.parseCliArgs('remove')).toMatchObject({ kind: 'Usage' });
    Vitest.expect(Slash.parseCliArgs('sync')).toMatchObject({
      kind: 'Usage',
      message: 'usage: /mf-references sync <name> (or /mf-references sync --all)',
    });
    Vitest.expect(Slash.parseCliArgs('sync alpha --all')).toMatchObject({
      kind: 'Usage',
      message: 'usage: pass either <name> or --all, not both',
    });
    Vitest.expect(Slash.parseCliArgs('update')).toMatchObject({ kind: 'Usage' });
    Vitest.expect(Slash.parseCliArgs('update alpha --all')).toMatchObject({ kind: 'Usage' });
    Vitest.expect(Slash.parseCliArgs('verify alpha --all')).toMatchObject({ kind: 'Usage' });
    Vitest.expect(Slash.parseCliArgs('explode')).toMatchObject({ kind: 'Usage' });
    Vitest.expect(Slash.parseCliArgs('help')).toEqual({ kind: 'Help' });
    Vitest.expect(Slash.parseCliArgs('')).toEqual({ kind: 'Help' });
  });
});

Vitest.describe('/mf-references run', () => {
  Vitest.it.effect('runs doctor --check as a report that fails on drift and writes nothing', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const messages: Array<string> = [];
      const failure = yield* flip(
        Slash.run(`doctor --check --dir ${root}`, recordingUi(messages), root).pipe(
          Effect.provide(realLive),
        ),
      );
      Vitest.expect(failure).toContain('Reference workspace is not ready');
      const output = messages.join('\n');
      Vitest.expect(output).toContain('failed store-root: missing .agents/@montflow/references');
      Vitest.expect(output).toContain('summary checks=8 failed=');

      const repaired = yield* Slash.run(`doctor --dir ${root}`, recordingUi(messages), root).pipe(
        Effect.provide(realLive),
      );
      Vitest.expect(repaired).toBeUndefined();
      Vitest.expect(messages.join('\n')).toContain('summary checks=8 failed=0');

      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('threads --human and --verbose into the renderer', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => seedStoreRoot(root));
      yield* Effect.promise(() => seedEntry(root, { name: 'alpha' }));
      yield* Effect.promise(() => mkdir(Reference.clonePath(root, 'alpha'), { recursive: true }));
      const messages: Array<string> = [];

      yield* Slash.run(`list --human --verbose --dir ${root}`, recordingUi(messages), root).pipe(
        Effect.provide(realLive),
      );
      const output = messages.join('\n');
      Vitest.expect(output).toContain('STATE');
      Vitest.expect(output).toContain('PATH');
      Vitest.expect(output).toContain('✓');
      Vitest.expect(output).toContain(URL);

      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('runs status with no name as an all-entry summary', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => seedStoreRoot(root));
      yield* Effect.promise(() => seedEntry(root, { name: 'alpha' }));
      const messages: Array<string> = [];

      yield* Slash.run(`status --dir ${root}`, recordingUi(messages), root).pipe(
        Effect.provide(realLive),
      );
      const output = messages.join('\n');
      Vitest.expect(output).toContain('missing alpha');
      Vitest.expect(output).toContain('summary total=1 missing=1 present=0');

      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('fails with a displayable message for a refusal and a usage error', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => seedStoreRoot(root));
      const messages: Array<string> = [];

      const refusal = yield* flip(
        Slash.run(`show absent --dir ${root}`, recordingUi(messages), root).pipe(
          Effect.provide(realLive),
        ),
      );
      Vitest.expect(refusal).toBe("refused: unknown reference 'absent'; run '/mf-references list'");

      const usage = yield* flip(
        Slash.run(`sync --dir ${root}`, recordingUi(messages), root).pipe(Effect.provide(realLive)),
      );
      Vitest.expect(usage).toBe('usage: /mf-references sync <name> (or /mf-references sync --all)');

      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('renders a refusal as a displayable string and never claims success', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      yield* Effect.promise(() => seedStoreRoot(root));
      const messages: Array<string> = [];

      const refused = yield* flip(
        Slash.run(
          `add ssh://git@example.test/owner/alpha.git --purpose "${PURPOSE}" --dir ${root}`,
          recordingUi(messages),
          root,
        ).pipe(Effect.provide(realLive)),
      );
      Vitest.expect(refused).toContain(
        "refused: invalid url 'ssh://git@example.test/owner/alpha.git'",
      );
      Vitest.expect(refused).toContain('use the https URL');
      Vitest.expect(messages.join('\n')).toContain('refused: invalid url');

      yield* cleanup(root);
    }),
  );
});

Vitest.describe('/mf-references byte and failure parity', () => {
  Vitest.it.effect('show notifies the exact bytes, with no appended newline', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const dir = join(root, Reference.STORE_DIR, 'alpha');
      const exact = Reference.encodeReferenceFile({
        reference: Reference.Reference.make({
          name: 'alpha',
          url: URL,
          purpose: PURPOSE,
          added: '2026-10-26',
        }),
        body: '\n# Notes',
      });
      yield* Effect.promise(() => mkdir(dir, { recursive: true }));
      yield* Effect.promise(() => writeFile(join(dir, Reference.ENTRY_FILE), exact));
      const messages: Array<string> = [];

      yield* Slash.run(`show alpha --dir ${root}`, recordingUi(messages), root).pipe(
        Effect.provide(realLive),
      );
      Vitest.expect(messages).toEqual([exact]);
      Vitest.expect((messages[0] ?? '').endsWith('\n')).toBe(false);

      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('status --fetch fails with the failure line, not only the summary', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      yield* Effect.promise(() => makeClone(root, 'alpha', origin.dir, URL));
      yield* Effect.promise(() => seedEntry(root, { name: 'alpha' }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));
      const messages: Array<string> = [];

      const failure = yield* flip(
        Slash.run(`status alpha --fetch --dir ${root}`, recordingUi(messages), root).pipe(
          Effect.provide(realLive),
        ),
      );
      Vitest.expect(failure).toContain('failed alpha fetch:');
      Vitest.expect(messages.join('\n')).toContain('present alpha');
      Vitest.expect(messages.join('\n')).toContain('failed alpha fetch:');

      yield* cleanup(root);
    }),
  );
});
