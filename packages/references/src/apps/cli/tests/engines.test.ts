import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import { Reference } from '../../../index.js';
import * as Engines from '../engines.apps.module.js';
import {
  PURPOSE,
  URL,
  advanceOrigin,
  cloningLive,
  counters,
  freshRoot,
  git,
  makeClone,
  makeOrigin,
  makeWorkspace,
  pathExists,
  realLive,
  seedEntry,
  seedStoreRoot,
} from './fixtures.js';

const cleanup = (root: string, origin?: string): Effect.Effect<void> =>
  Effect.promise(async () => {
    await rm(root, { recursive: true, force: true });
    if (origin !== undefined) await rm(origin, { recursive: true, force: true });
  });

const flip = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<E, A, R> =>
  effect.pipe(Effect.flip);

Vitest.describe('CLI engines list', () => {
  Vitest.it.effect('lists installed and missing entries and filters by status', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => seedStoreRoot(root));
      yield* Effect.promise(() => seedEntry(root, { name: 'alpha' }));
      yield* Effect.promise(() => seedEntry(root, { name: 'beta' }));
      yield* Effect.promise(() => mkdir(Reference.clonePath(root, 'alpha'), { recursive: true }));

      const rows = yield* Engines.list({ cwd: root });
      Vitest.expect(rows.map((row) => row.slug)).toEqual(['alpha', 'beta']);
      Vitest.expect(rows[0]).toMatchObject({
        slug: 'alpha',
        installed: true,
        purpose: PURPOSE,
        url: URL,
        path: '.agents/references/alpha',
        entryPath: '.agents/@montflow/references/alpha/REFERENCE.md',
      });
      Vitest.expect(rows[1]).toMatchObject({ slug: 'beta', installed: false });

      const missing = yield* Engines.list({ cwd: root }, { status: 'missing' });
      Vitest.expect(missing.map((row) => row.slug)).toEqual(['beta']);
      const installed = yield* Engines.list({ cwd: root }, { status: 'installed' });
      Vitest.expect(installed.map((row) => row.slug)).toEqual(['alpha']);

      yield* cleanup(root);
    }).pipe(Effect.provide(realLive)),
  );

  Vitest.it.effect('refuses an unknown --status value and a missing store root', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const missingRoot = yield* flip(Engines.list({ cwd: root }));
      Vitest.expect(missingRoot).toContain('Store root .agents/@montflow/references/ is missing');

      yield* Effect.promise(() => seedStoreRoot(root));
      const bad = yield* flip(Engines.list({ cwd: root }, { status: 'present' }));
      Vitest.expect(bad).toBe("refused: unknown status 'present'; use installed or missing");

      yield* cleanup(root);
    }).pipe(Effect.provide(realLive)),
  );
});

Vitest.describe('CLI engines show', () => {
  Vitest.it.effect('shows one entry byte for byte and refuses an unknown slug', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => seedEntry(root, { name: 'alpha' }));

      const raw = yield* Engines.show({ cwd: root }, 'alpha', 'mf-references');
      Vitest.expect(raw).toContain('name: alpha');
      Vitest.expect(raw).toContain(`url: ${URL}`);
      Vitest.expect(raw).toContain('# Notes');

      const refused = yield* flip(Engines.show({ cwd: root }, 'absent', 'mf-references'));
      Vitest.expect(refused).toBe("refused: unknown reference 'absent'; run 'mf-references list'");

      yield* cleanup(root);
    }).pipe(Effect.provide(realLive)),
  );

  Vitest.it.effect('returns the exact bytes, including a file without a trailing newline', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const exact = Reference.encodeReferenceFile({
        reference: Reference.Reference.make({
          name: 'alpha',
          url: URL,
          purpose: PURPOSE,
          added: '2026-10-26',
        }),
        body: '\n# Notes',
      });
      const dir = join(root, Reference.STORE_DIR, 'alpha');
      yield* Effect.promise(() => mkdir(dir, { recursive: true }));
      yield* Effect.promise(() => writeFile(join(dir, Reference.ENTRY_FILE), exact));

      const raw = yield* Engines.show({ cwd: root }, 'alpha');
      Vitest.expect(raw).toBe(exact);
      Vitest.expect(raw.endsWith('\n')).toBe(false);

      yield* cleanup(root);
    }).pipe(Effect.provide(realLive)),
  );

  Vitest.it.effect('refuses traversal, nested, and absolute names before store access', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const outside = join(root, 'secret');
      yield* Effect.promise(() => mkdir(outside, { recursive: true }));
      yield* Effect.promise(() => writeFile(join(outside, Reference.ENTRY_FILE), 'outside\n'));

      for (const name of ['../secret', 'a/b', outside]) {
        const refused = yield* flip(Engines.show({ cwd: root }, name, 'mf-references'));
        Vitest.expect(refused).toBe(
          `refused: invalid name '${name}': must match ^[a-z0-9]+(-[a-z0-9]+)*$`,
        );
      }

      yield* cleanup(root);
    }).pipe(Effect.provide(realLive)),
  );
});

Vitest.describe('CLI engines verify', () => {
  Vitest.it.effect('verifies a fresh checkout with zero clones clean', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => seedStoreRoot(root));

      const report = yield* Engines.verify({ cwd: root }, { invocation: 'mf-references' });
      Vitest.expect(report.entries).toEqual([]);
      Vitest.expect(report.issueCount).toBe(0);
      Vitest.expect(report.warningCount).toBe(0);
      Vitest.expect(report.storeMissing).toBe(false);

      yield* cleanup(root);
    }).pipe(Effect.provide(realLive)),
  );

  Vitest.it.effect('adds clone truth only under --clones', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => seedEntry(root, { name: 'alpha' }));

      const plain = yield* Engines.verify({ cwd: root }, { invocation: 'mf-references' });
      Vitest.expect(plain.issueCount).toBe(0);

      const clones = yield* Engines.verify(
        { cwd: root },
        { clones: true, invocation: 'mf-references' },
      );
      Vitest.expect(clones.issueCount).toBe(1);
      Vitest.expect(clones.entries[0]?.path).toBe(
        '.agents/@montflow/references/alpha/REFERENCE.md',
      );
      Vitest.expect(clones.entries[0]?.issues[0]?.message).toContain(
        "run 'mf-references sync alpha'",
      );

      yield* cleanup(root);
    }).pipe(Effect.provide(realLive)),
  );

  Vitest.it.effect('verifies one name, and refuses an unknown name or name plus --all', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => seedEntry(root, { name: 'alpha' }));
      yield* Effect.promise(() => seedEntry(root, { name: 'beta' }));

      const one = yield* Engines.verify(
        { cwd: root },
        { name: 'alpha', invocation: 'mf-references' },
      );
      Vitest.expect(one.entries).toHaveLength(1);
      Vitest.expect(one.entries[0]?.path).toContain('/alpha/');

      const unknown = yield* flip(
        Engines.verify({ cwd: root }, { name: 'absent', invocation: 'mf-references' }),
      );
      Vitest.expect(unknown).toBe("refused: unknown reference 'absent'; run 'mf-references list'");

      const both = yield* flip(Engines.verify({ cwd: root }, { name: 'alpha', all: true }));
      Vitest.expect(both).toBe('usage: pass either <name> or --all, not both');

      yield* cleanup(root);
    }).pipe(Effect.provide(realLive)),
  );
});

Vitest.describe('CLI engines add', () => {
  Vitest.it.effect('creates an entry through the recorded port and writes it last', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      const origin = yield* Effect.promise(makeOrigin);
      const calls = counters();

      yield* Effect.gen(function* () {
        const result = yield* Engines.add({ cwd: root }, URL, {
          purpose: PURPOSE,
          invocation: 'mf-references',
        });
        Vitest.expect(result).toMatchObject({
          kind: 'created',
          slug: 'fixture',
          url: URL,
          message: `created fixture ${URL}`,
        });
        Vitest.expect(calls.clone).toEqual([URL]);
        Vitest.expect(
          yield* Effect.promise(() => pathExists(Reference.clonePath(root, 'fixture'))),
        ).toBe(true);
        Vitest.expect(
          yield* Effect.promise(() =>
            pathExists(join(root, Reference.STORE_DIR, 'fixture', Reference.ENTRY_FILE)),
          ),
        ).toBe(true);
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));

      yield* cleanup(root, origin.dir);
    }),
  );

  Vitest.it.effect('refuses ssh, a missing purpose, and a registered URL before cloning', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      const origin = yield* Effect.promise(makeOrigin);
      const calls = counters();

      yield* Effect.gen(function* () {
        const ssh = yield* Engines.add({ cwd: root }, 'ssh://git@github.com/a/b.git', {
          purpose: PURPOSE,
        });
        Vitest.expect(ssh).toMatchObject({ kind: 'refused', code: 'invalid-url' });
        Vitest.expect(calls.clone).toEqual([]);

        const noPurpose = yield* Engines.add({ cwd: root }, URL, {});
        Vitest.expect(noPurpose).toMatchObject({ kind: 'refused', code: 'purpose-required' });

        yield* Effect.promise(() => seedEntry(root, { name: 'fixture' }));
        const routed = yield* Engines.add({ cwd: root }, URL, { invocation: 'mf-references' });
        Vitest.expect(routed).toMatchObject({
          kind: 'routed',
          slug: 'fixture',
          notice: `routed add -> update fixture: ${URL} is already registered as fixture`,
        });
        if (routed.kind === 'routed') {
          Vitest.expect(routed.update).toMatchObject({ kind: 'created', slug: 'fixture' });
        }
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));

      yield* cleanup(root, origin.dir);
    }),
  );
});

Vitest.describe('CLI engines update', () => {
  Vitest.it.effect('updates a clone, is a no-op when current, and refuses a dirty one', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const clone = yield* Effect.promise(() => makeClone(root, 'fixture', origin.dir, URL));
      yield* Effect.promise(() => advanceOrigin(origin.dir));
      yield* Effect.promise(() => seedEntry(root, { name: 'fixture' }));

      const moved = yield* Engines.update({ cwd: root }, 'fixture', {
        invocation: 'mf-references',
      });
      Vitest.expect(moved).toMatchObject({ kind: 'updated', slug: 'fixture' });
      const present = yield* Engines.update({ cwd: root }, 'fixture', {
        invocation: 'mf-references',
      });
      Vitest.expect(present).toMatchObject({ kind: 'present', message: 'present fixture' });

      yield* Effect.promise(() => writeFile(join(clone, 'file.txt'), 'local edit\n'));
      const dirty = yield* Engines.update({ cwd: root }, 'fixture', {
        invocation: 'mf-references',
      });
      Vitest.expect(dirty).toMatchObject({ kind: 'refused', code: 'dirty' });

      const unknown = yield* Engines.update({ cwd: root }, 'absent', {
        invocation: 'mf-references',
      });
      Vitest.expect(unknown).toMatchObject({ kind: 'refused', code: 'unknown-reference' });

      yield* cleanup(root, origin.dir);
    }).pipe(Effect.provide(realLive)),
  );

  Vitest.it.effect('updates every entry and reports partial failure', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      yield* Effect.promise(() => seedEntry(root, { name: 'alpha' }));
      yield* Effect.promise(() => seedEntry(root, { name: 'beta' }));
      const alpha = yield* Effect.promise(() => makeClone(root, 'alpha', origin.dir, URL));
      const beta = yield* Effect.promise(() => makeClone(root, 'beta', origin.dir, URL));
      yield* Effect.promise(() => advanceOrigin(origin.dir));
      yield* Effect.promise(() => writeFile(join(beta, 'scratch.txt'), 'scratch\n'));

      const report = yield* Engines.updateAll({ cwd: root }, { invocation: 'mf-references' });
      Vitest.expect(report.failed).toBe(true);
      Vitest.expect(report.summary).toBe('summary total=2 present=1 failed=1');
      Vitest.expect(report.entries[0]?.result).toMatchObject({ kind: 'updated' });
      Vitest.expect(report.entries[1]?.result).toMatchObject({ kind: 'refused', code: 'dirty' });
      Vitest.expect(alpha.endsWith('/alpha')).toBe(true);

      yield* cleanup(root, origin.dir);
    }).pipe(Effect.provide(realLive)),
  );
});

Vitest.describe('CLI engines sync', () => {
  Vitest.it.effect('clones a missing entry and refuses neither/both selection', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const calls = counters();
      yield* Effect.promise(() => seedEntry(root, { name: 'alpha' }));

      yield* Effect.gen(function* () {
        const result = yield* Engines.sync(
          { cwd: root },
          { name: 'alpha', invocation: 'mf-references' },
        );
        if (!('entries' in result)) throw new Error('expected a sync report');
        Vitest.expect(result.failed).toBe(false);
        Vitest.expect(result.entries[0]).toMatchObject({
          kind: 'created',
          slug: 'alpha',
          message: `created alpha ${URL}`,
        });

        const neither = yield* Engines.sync({ cwd: root }, { invocation: 'mf-references' });
        Vitest.expect(neither).toMatchObject({ kind: 'refused', code: 'usage' });
        if ('kind' in neither) {
          Vitest.expect(neither.message).toBe(
            'usage: mf-references sync <name> (or mf-references sync --all)',
          );
        }
        const both = yield* Engines.sync({ cwd: root }, { name: 'alpha', all: true });
        Vitest.expect(both).toMatchObject({
          kind: 'refused',
          message: 'usage: pass either <name> or --all, not both',
        });
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));

      yield* cleanup(root, origin.dir);
    }),
  );

  Vitest.it.effect('skips a dirty clone and never writes the store', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const clone = yield* Effect.promise(() => makeClone(root, 'fixture', origin.dir, URL));
      yield* Effect.promise(() => writeFile(join(clone, 'scratch.txt'), 'scratch\n'));
      yield* Effect.promise(() => seedEntry(root, { name: 'fixture' }));

      const result = yield* Engines.sync({ cwd: root }, { all: true, invocation: 'mf-references' });
      if (!('entries' in result)) throw new Error('expected a sync report');
      Vitest.expect(result.failed).toBe(true);
      Vitest.expect(result.entries[0]).toMatchObject({ kind: 'skipped', slug: 'fixture' });

      yield* cleanup(root, origin.dir);
    }).pipe(Effect.provide(realLive)),
  );
});

Vitest.describe('CLI engines status', () => {
  Vitest.it.effect(
    'reports one row per entry, exits 0 on state, and orders behind before ahead',
    () =>
      Effect.gen(function* () {
        const root = yield* Effect.promise(freshRoot);
        const origin = yield* Effect.promise(makeOrigin);
        yield* Effect.promise(() => seedEntry(root, { name: 'missing' }));
        yield* Effect.promise(() => seedEntry(root, { name: 'present' }));
        const clone = yield* Effect.promise(() => makeClone(root, 'present', origin.dir, URL));

        const report = yield* Engines.status({ cwd: root }, { invocation: 'mf-references' });
        if (!('rows' in report)) throw new Error('expected a status report');
        Vitest.expect(report.rows.map((row) => row.state)).toEqual(['missing', 'present']);
        Vitest.expect(report.refused).toBe(false);
        Vitest.expect(report.summary).toBe(
          'summary total=2 missing=1 present=1 dirty=0 ref-mismatch=0 foreign=0 invalid=0',
        );
        Vitest.expect(report.rows[1]?.path).toBe('.agents/references/present');

        yield* Effect.promise(() => advanceOrigin(origin.dir));
        yield* Effect.promise(async () => {
          await writeFile(join(clone, 'local.txt'), 'local\n');
        });
        yield* Effect.promise(() => git(clone, ['add', 'local.txt']));
        yield* Effect.promise(() => git(clone, ['commit', '-m', 'local']));
        const fetched = yield* Engines.status(
          { cwd: root },
          { fetch: true, invocation: 'mf-references' },
        );
        if (!('rows' in fetched)) throw new Error('expected a status report');
        const present = fetched.rows.find((row) => row.slug === 'present');
        Vitest.expect(present?.message).toBe('present present behind=1 ahead=1');
        const message = present?.message ?? '';
        Vitest.expect(message.indexOf('behind=')).toBeLessThan(message.indexOf('ahead='));

        yield* cleanup(root, origin.dir);
      }).pipe(Effect.provide(realLive)),
  );

  Vitest.it.effect('refuses a foreign clone and an unknown name', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      yield* Effect.promise(() => seedEntry(root, { name: 'fixture' }));
      yield* Effect.promise(() =>
        makeClone(root, 'fixture', origin.dir, 'https://example.test/other.git'),
      );

      const report = yield* Engines.status({ cwd: root }, { invocation: 'mf-references' });
      if (!('rows' in report)) throw new Error('expected a status report');
      Vitest.expect(report.refused).toBe(true);
      Vitest.expect(report.rows[0]).toMatchObject({ state: 'foreign', refused: true });

      const unknown = yield* Engines.status({ cwd: root }, { name: 'absent' });
      Vitest.expect(unknown).toMatchObject({ kind: 'refused', code: 'unknown-reference' });

      yield* cleanup(root, origin.dir);
    }).pipe(Effect.provide(realLive)),
  );
});

Vitest.describe('CLI engines remove', () => {
  Vitest.it.effect('removes the entry and its clone, and keeps a clone with --keep-clone', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      yield* Effect.promise(() => seedEntry(root, { name: 'alpha' }));
      yield* Effect.promise(() => seedEntry(root, { name: 'beta' }));
      yield* Effect.promise(() => makeClone(root, 'alpha', origin.dir, URL));
      yield* Effect.promise(() => makeClone(root, 'beta', origin.dir, URL));

      const removed = yield* Engines.remove({ cwd: root }, 'alpha', {
        invocation: 'mf-references',
      });
      Vitest.expect(removed).toMatchObject({
        kind: 'removed',
        slug: 'alpha',
        keptClone: false,
        message: 'removed alpha',
      });
      Vitest.expect(
        yield* Effect.promise(() => pathExists(Reference.clonePath(root, 'alpha'))),
      ).toBe(false);
      Vitest.expect(
        yield* Effect.promise(() => pathExists(join(root, Reference.STORE_DIR, 'alpha'))),
      ).toBe(false);

      const kept = yield* Engines.remove({ cwd: root }, 'beta', { keepClone: true });
      Vitest.expect(kept.message).toBe('removed beta clone=kept');
      Vitest.expect(
        yield* Effect.promise(() => pathExists(Reference.clonePath(root, 'beta'))),
      ).toBe(true);
      Vitest.expect(
        yield* Effect.promise(() => pathExists(join(root, Reference.STORE_DIR, 'beta'))),
      ).toBe(false);

      yield* cleanup(root, origin.dir);
    }).pipe(Effect.provide(realLive)),
  );

  Vitest.it.effect('refuses a dirty or foreign clone, and removes a missing clone', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      yield* Effect.promise(() => seedEntry(root, { name: 'dirty' }));
      yield* Effect.promise(() => seedEntry(root, { name: 'foreign' }));
      yield* Effect.promise(() => seedEntry(root, { name: 'missing' }));
      const dirty = yield* Effect.promise(() => makeClone(root, 'dirty', origin.dir, URL));
      yield* Effect.promise(() => writeFile(join(dirty, 'scratch.txt'), 'scratch\n'));
      yield* Effect.promise(() =>
        makeClone(root, 'foreign', origin.dir, 'https://example.test/other.git'),
      );

      const dirtyRefusal = yield* flip(
        Engines.remove({ cwd: root }, 'dirty', { invocation: 'mf-references' }),
      );
      Vitest.expect(dirtyRefusal).toBe(
        'refused: dirty clone is dirty (1 changed paths); rerun with --keep-clone to unregister and keep it',
      );
      const foreignRefusal = yield* flip(
        Engines.remove({ cwd: root }, 'foreign', { invocation: 'mf-references' }),
      );
      Vitest.expect(foreignRefusal).toContain('is not a clone of');
      Vitest.expect(
        yield* Effect.promise(() => pathExists(join(root, Reference.STORE_DIR, 'foreign'))),
      ).toBe(true);

      const removed = yield* Engines.remove({ cwd: root }, 'missing');
      Vitest.expect(removed.message).toBe('removed missing');

      const unknown = yield* flip(Engines.remove({ cwd: root }, 'absent'));
      Vitest.expect(unknown).toContain("unknown reference 'absent'");

      yield* cleanup(root, origin.dir);
    }).pipe(Effect.provide(realLive)),
  );
});

Vitest.describe('CLI engines security and failure paths', () => {
  Vitest.it.effect(
    'refuses traversal and absolute names for remove before touching the store',
    () =>
      Effect.gen(function* () {
        const root = yield* Effect.promise(freshRoot);
        const victim = join(root, 'victim');
        yield* Effect.promise(() => mkdir(victim, { recursive: true }));
        yield* Effect.promise(() => writeFile(join(victim, Reference.ENTRY_FILE), 'victim\n'));

        for (const name of ['../victim', 'nested/name', victim]) {
          const refused = yield* flip(
            Engines.remove({ cwd: root }, name, { invocation: 'mf-references' }),
          );
          Vitest.expect(refused).toBe(
            `refused: invalid name '${name}': must match ^[a-z0-9]+(-[a-z0-9]+)*$`,
          );
        }
        for (const refused of [
          yield* Engines.update({ cwd: root }, 'nested/name'),
          yield* Engines.sync({ cwd: root }, { name: 'nested/name' }),
          yield* Engines.status({ cwd: root }, { name: 'nested/name' }),
        ]) {
          Vitest.expect(refused).toMatchObject({ kind: 'refused', code: 'invalid-name' });
        }
        const verifyRefused = yield* flip(Engines.verify({ cwd: root }, { name: 'nested/name' }));
        Vitest.expect(verifyRefused).toBe(
          "refused: invalid name 'nested/name': must match ^[a-z0-9]+(-[a-z0-9]+)*$",
        );
        Vitest.expect(yield* Effect.promise(() => pathExists(victim))).toBe(true);

        yield* cleanup(root);
      }).pipe(Effect.provide(realLive)),
  );

  Vitest.it.effect('treats an unreadable index as unsafe for status and remove', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const clone = yield* Effect.promise(() => makeClone(root, 'alpha', origin.dir, URL));
      yield* Effect.promise(() => seedEntry(root, { name: 'alpha' }));
      yield* Effect.promise(() => writeFile(join(clone, '.git', 'index'), 'garbage\n'));
      yield* Effect.promise(() => writeFile(join(clone, 'UNTRACKED.txt'), 'x\n'));

      const report = yield* Engines.status({ cwd: root }, { invocation: 'mf-references' });
      if (!('rows' in report)) throw new Error('expected a status report');
      Vitest.expect(report.refused).toBe(true);
      Vitest.expect(report.rows[0]?.state).toBe('dirty');
      Vitest.expect(report.rows[0]?.failure?.message).toContain('failed alpha status:');

      const refused = yield* flip(
        Engines.remove({ cwd: root }, 'alpha', { invocation: 'mf-references' }),
      );
      Vitest.expect(refused).toContain('failed alpha status:');
      Vitest.expect(yield* Effect.promise(() => pathExists(clone))).toBe(true);
      Vitest.expect(
        yield* Effect.promise(() =>
          pathExists(join(root, Reference.STORE_DIR, 'alpha', Reference.ENTRY_FILE)),
        ),
      ).toBe(true);

      yield* cleanup(root, origin.dir);
    }).pipe(Effect.provide(realLive)),
  );

  Vitest.it.effect('renders the last-known row and a failed fetch line for status --fetch', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      yield* Effect.promise(() => makeClone(root, 'alpha', origin.dir, URL));
      yield* Effect.promise(() => seedEntry(root, { name: 'alpha' }));
      yield* Effect.promise(() => rm(origin.dir, { recursive: true, force: true }));

      const report = yield* Engines.status(
        { cwd: root },
        { fetch: true, invocation: 'mf-references' },
      );
      if (!('rows' in report)) throw new Error('expected a status report');
      Vitest.expect(report.refused).toBe(true);
      Vitest.expect(report.rows[0]?.state).toBe('present');
      Vitest.expect(report.rows[0]?.failure?.message).toContain('failed alpha fetch:');

      yield* cleanup(root);
    }).pipe(Effect.provide(realLive)),
  );

  Vitest.it.effect('verify --clones fails an unpinned clone on the wrong branch and detached', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const origin = yield* Effect.promise(makeOrigin);
      const clone = yield* Effect.promise(() => makeClone(root, 'alpha', origin.dir, URL));
      yield* Effect.promise(() => seedEntry(root, { name: 'alpha' }));

      yield* Effect.promise(() => git(clone, ['checkout', '-b', 'other']));
      const wrong = yield* Engines.verify(
        { cwd: root },
        { clones: true, invocation: 'mf-references' },
      );
      Vitest.expect(wrong.issueCount).toBe(1);
      Vitest.expect(wrong.entries[0]?.issues[0]).toMatchObject({ field: 'head' });
      Vitest.expect(wrong.entries[0]?.issues[0]?.message).toContain(
        "Clone is on branch 'other', expected 'main'.",
      );

      yield* Effect.promise(() => git(clone, ['checkout', '--detach', 'HEAD']));
      const detached = yield* Engines.verify(
        { cwd: root },
        { clones: true, invocation: 'mf-references' },
      );
      Vitest.expect(detached.issueCount).toBe(1);
      Vitest.expect(detached.entries[0]?.issues[0]?.message).toContain(
        "Clone HEAD is detached; expected branch 'main'.",
      );

      yield* cleanup(root, origin.dir);
    }).pipe(Effect.provide(realLive)),
  );

  Vitest.it.effect('verify includes the committed packaged skills', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => seedStoreRoot(root));

      const clean = yield* Engines.verify({ cwd: root }, { invocation: 'mf-references' });
      Vitest.expect(clean.skills).toHaveLength(2);
      Vitest.expect(clean.issueCount).toBe(0);

      const skillsDir = yield* Effect.promise(freshRoot);
      for (const name of ['montflow-add-reference', 'montflow-find-reference']) {
        yield* Effect.promise(() => mkdir(join(skillsDir, name), { recursive: true }));
        yield* Effect.promise(() =>
          writeFile(join(skillsDir, name, 'SKILL.md'), '---\nname: broken\n---\n'),
        );
      }
      const broken = yield* Engines.verify(
        { cwd: root },
        { invocation: 'mf-references', skillsDir },
      );
      Vitest.expect(broken.issueCount).toBeGreaterThan(0);
      Vitest.expect(broken.skills.some((entry) => entry.issues.length > 0)).toBe(true);

      yield* cleanup(skillsDir);
      yield* cleanup(root);
    }).pipe(Effect.provide(realLive)),
  );

  Vitest.it.effect('refuses an invalid purpose before routing, including the empty string', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      const origin = yield* Effect.promise(makeOrigin);
      const calls = counters();

      yield* Effect.gen(function* () {
        const result = yield* Engines.add({ cwd: root }, URL, {
          purpose: '',
          invocation: 'mf-references',
        });
        Vitest.expect(result).toMatchObject({ kind: 'refused', code: 'invalid-purpose' });
        Vitest.expect(calls.clone).toEqual([]);
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));

      yield* cleanup(root, origin.dir);
    }),
  );

  Vitest.it.effect('refuses a pre-existing undecodable entry without touching it', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      const origin = yield* Effect.promise(makeOrigin);
      const calls = counters();
      const dir = join(root, Reference.STORE_DIR, 'fixture');
      const file = join(dir, Reference.ENTRY_FILE);
      const original = '---\nname: Fixture\n---\n\n# Notes\nhand-written\n';
      yield* Effect.promise(() => mkdir(dir, { recursive: true }));
      yield* Effect.promise(() => writeFile(file, original));

      yield* Effect.gen(function* () {
        const result = yield* Engines.add({ cwd: root }, URL, {
          purpose: PURPOSE,
          invocation: 'mf-references',
        });
        Vitest.expect(result).toMatchObject({ kind: 'refused', code: 'slug-collision' });
        if (result.kind === 'refused' || result.kind === 'failed') {
          Vitest.expect(result.message).toContain('does not decode');
        }
        Vitest.expect(calls.clone).toEqual([]);
      }).pipe(Effect.provide(cloningLive(origin.dir, calls)));

      Vitest.expect(yield* Effect.promise(() => pathExists(file))).toBe(true);
      Vitest.expect(yield* Effect.promise(() => readFile(file, 'utf8'))).toBe(original);
      Vitest.expect(
        yield* Effect.promise(() => pathExists(Reference.clonePath(root, 'fixture'))),
      ).toBe(false);

      yield* cleanup(root, origin.dir);
    }),
  );
});

Vitest.describe('CLI engines add occupancy', () => {
  Vitest.it.effect('a failed clone never deletes a pre-existing undecodable entry', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      const calls = counters();
      const dir = join(root, Reference.STORE_DIR, 'fixture');
      const file = join(dir, Reference.ENTRY_FILE);
      const original = '---\nname: Fixture\n---\n\n# Notes\nhand-written\n';
      yield* Effect.promise(() => mkdir(dir, { recursive: true }));
      yield* Effect.promise(() => writeFile(file, original));

      yield* Effect.gen(function* () {
        const result = yield* Engines.add({ cwd: root }, URL, {
          purpose: PURPOSE,
          invocation: 'mf-references',
        });
        Vitest.expect(result).toMatchObject({ kind: 'refused', code: 'slug-collision' });
        Vitest.expect(calls.clone).toEqual([]);
      }).pipe(Effect.provide(cloningLive('/tmp/mf-references-no-such-origin', calls)));

      Vitest.expect(yield* Effect.promise(() => readFile(file, 'utf8'))).toBe(original);
      Vitest.expect(
        yield* Effect.promise(() => pathExists(Reference.clonePath(root, 'fixture'))),
      ).toBe(false);

      yield* cleanup(root);
    }),
  );
});

const seedMismatch = async (root: string): Promise<void> => {
  await seedStoreRoot(root);
  const dir = join(root, Reference.STORE_DIR, 'wrongdir');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, Reference.ENTRY_FILE),
    Reference.encodeReferenceFile({
      reference: Reference.Reference.make({
        name: 'alpha2',
        url: URL,
        purpose: PURPOSE,
        added: '2026-10-26',
      }),
      body: '\n# Notes\n',
    }),
  );
};

Vitest.describe('CLI engines unusable entries', () => {
  Vitest.it.effect('lists a name/directory mismatch as an invalid entry', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => seedMismatch(root));

      const rows = yield* Engines.list({ cwd: root }, { invocation: 'mf-references' });
      Vitest.expect(rows[0]?.purpose).toContain("does not match directory 'wrongdir'");

      yield* cleanup(root);
    }).pipe(Effect.provide(realLive)),
  );

  Vitest.it.effect('unregisters an unusable entry and keeps its clone', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => seedMismatch(root));
      yield* Effect.promise(() =>
        mkdir(Reference.clonePath(root, 'wrongdir'), { recursive: true }),
      );

      const removed = yield* Engines.remove({ cwd: root }, 'wrongdir', {
        invocation: 'mf-references',
      });
      Vitest.expect(removed).toMatchObject({
        kind: 'removed',
        keptClone: true,
        message: 'removed wrongdir clone=kept (invalid entry)',
      });
      Vitest.expect(
        yield* Effect.promise(() => pathExists(join(root, Reference.STORE_DIR, 'wrongdir'))),
      ).toBe(false);
      Vitest.expect(
        yield* Effect.promise(() => pathExists(Reference.clonePath(root, 'wrongdir'))),
      ).toBe(true);

      yield* cleanup(root);
    }).pipe(Effect.provide(realLive)),
  );
});
