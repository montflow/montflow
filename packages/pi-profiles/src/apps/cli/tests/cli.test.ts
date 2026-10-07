import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { join } from 'node:path';
import { Effect, Layer } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import * as Vitest from '@effect/vitest';
import * as Cli from '../index.js';
import * as Interactive from '../../interactive/index.js';
import { ProfileStore } from '../../../services/index.js';

/** Platform layers plus the store, for headless CLI tests. */
const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);
const TestLive = Layer.provide(ProfileStore.Default, NodeLive);

/** Notify-only UI: dialogs reject so any prompt attempt fails the test. */
const scriptedUi = (notifies: Array<string>): Interactive.InteractiveUi => ({
  select: () => Promise.reject(new Error('CLI must not prompt')),
  confirm: () => Promise.reject(new Error('CLI must not prompt')),
  input: () => Promise.reject(new Error('CLI must not prompt')),
  notify: (message) => {
    notifies.push(message);
  },
});

/**
 * Run `fn` with a fresh temp working directory, auto-deleted afterwards.
 * @param fn - test body receiving the directory
 * @returns Effect completing with the body value
 */
const withTempDir = (
  fn: (dir: string) => Effect.Effect<void, string, ProfileStore.ProfileStore>,
): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-profiles-cli-' });
    return yield* fn(dir).pipe(Effect.provide(TestLive));
  }).pipe(
    Effect.provide(NodeLive),
    Effect.mapError((error) => String(error)),
    Effect.scoped,
  );

Vitest.describe('Cli.parseCliArgs', () => {
  Vitest.it('parses create flags in both --flag value and --flag=value forms', () => {
    Vitest.expect(
      Cli.parseCliArgs(
        'create reviewer --description "Reviews code" --model a/m --skills x,y --instructions "Be strict" --checklist "First; Second"',
      ),
    ).toStrictEqual({
      kind: 'Create',
      name: 'reviewer',
      fields: {
        description: 'Reviews code',
        model: 'a/m',
        skills: ['x', 'y'],
        instructions: 'Be strict',
        checklist: ['First', 'Second'],
      },
    });
    Vitest.expect(Cli.parseCliArgs('modify reviewer --description=New --skills=')).toStrictEqual({
      kind: 'Modify',
      name: 'reviewer',
      fields: {
        description: 'New',
        model: undefined,
        skills: undefined,
        instructions: undefined,
        checklist: undefined,
      },
    });
  });

  Vitest.it('falls back to Help on empty, unknown, or incomplete input', () => {
    Vitest.expect(Cli.parseCliArgs('')).toStrictEqual({ kind: 'Help' });
    Vitest.expect(Cli.parseCliArgs('frobnicate')).toStrictEqual({ kind: 'Help' });
    Vitest.expect(Cli.parseCliArgs('show')).toStrictEqual({ kind: 'Help' });
    Vitest.expect(Cli.parseCliArgs('create reviewer --bogus x')).toStrictEqual({ kind: 'Help' });
  });
});

Vitest.describe('Cli.run', () => {
  Vitest.it.effect('creates, shows, modifies, lists, and deletes without prompting', () =>
    Effect.gen(function* () {
      const notifies: Array<string> = [];
      const ui = scriptedUi(notifies);
      yield* withTempDir((dir) =>
        Effect.gen(function* () {
          yield* Cli.run(
            'create code-reviewer --description "Reviews code" --model anthropic/m --skills montflow-create-pi-profiles --instructions "Be strict." --checklist "Flag issues; Cite files"',
            ui,
            dir,
          );
          yield* Cli.run('show code-reviewer', ui, dir);
          yield* Cli.run('modify code-reviewer --description "Reviews code fast"', ui, dir);
          yield* Cli.run('list', ui, dir);
          yield* Cli.run('delete code-reviewer', ui, dir);
          yield* Cli.run('list', ui, dir);
        }),
      );
      Vitest.expect(notifies[0]).toBe("Saved profile 'code-reviewer'.");
      Vitest.expect(notifies[1]).toContain('code-reviewer — Reviews code');
      Vitest.expect(notifies[1]).toContain('model: anthropic/m');
      Vitest.expect(notifies[1]).toContain('skills: montflow-create-pi-profiles');
      Vitest.expect(notifies[2]).toBe("Saved profile 'code-reviewer'.");
      Vitest.expect(notifies[3]).toContain('• code-reviewer — Reviews code fast');
      Vitest.expect(notifies[4]).toBe("Deleted profile 'code-reviewer'.");
      Vitest.expect(notifies[5]).toContain('No profiles yet');
    }),
  );

  Vitest.it.effect('fails create without a description or with a bad slug', () =>
    Effect.gen(function* () {
      const ui = scriptedUi([]);
      yield* withTempDir((dir) =>
        Effect.gen(function* () {
          const missing = yield* Cli.run('create x', ui, dir).pipe(
            Effect.flip,
            Effect.mapError(() => 'should have failed'),
          );
          Vitest.expect(missing).toContain('--description');
          const badSlug = yield* Cli.run('create "Bad Name" --description d', ui, dir).pipe(
            Effect.flip,
            Effect.mapError(() => 'should have failed'),
          );
          Vitest.expect(badSlug).toContain('kebab-case');
          const unknown = yield* Cli.run('show nope', ui, dir).pipe(
            Effect.flip,
            Effect.mapError(() => 'should have failed'),
          );
          Vitest.expect(unknown).toContain("Unknown profile 'nope'");
        }),
      );
    }),
  );
});

Vitest.describe('Cli list --status', () => {
  Vitest.it('parses --status and rejects unknown flags', () => {
    Vitest.expect(Cli.parseCliArgs('list --status=invalid')).toStrictEqual({
      kind: 'List',
      status: 'invalid',
    });
    Vitest.expect(Cli.parseCliArgs('list')).toStrictEqual({ kind: 'List', status: undefined });
    Vitest.expect(Cli.parseCliArgs('list --bogus')).toStrictEqual({ kind: 'Help' });
  });

  Vitest.it('treats an absent or empty status as no filter', () => {
    Vitest.expect(Cli.resolveListStatus(undefined).pipe(Effect.runSync)).toBeUndefined();
    Vitest.expect(Cli.resolveListStatus('').pipe(Effect.runSync)).toBeUndefined();
    Vitest.expect(Cli.resolveListStatus('valid').pipe(Effect.runSync)).toBe('valid');
    Vitest.expect(Cli.resolveListStatus('invalid').pipe(Effect.runSync)).toBe('invalid');
  });

  Vitest.it.effect('refuses an unknown status, naming the accepted values', () =>
    Effect.gen(function* () {
      const error = yield* Cli.resolveListStatus('bogus').pipe(Effect.flip);
      Vitest.expect(error).toContain("Unknown status 'bogus'");
      Vitest.expect(error).toContain('valid, invalid');
    }),
  );

  Vitest.it.effect('keeps only profiles whose file matches the status', () =>
    withTempDir((dir) =>
      Effect.gen(function* () {
        yield* Cli.run(
          'create reviewer --description "Reviews code" --instructions "Be strict." --checklist "Flag issues"',
          scriptedUi([]),
          dir,
        );
        const empty: Array<string> = [];
        yield* Cli.run('list --status invalid', scriptedUi(empty), dir);
        Vitest.expect(empty.join('\n')).toBe("No profiles with status 'invalid'.");

        yield* Effect.gen(function* () {
          const fs = yield* FileSystem;
          const badDir = join(dir, '.agents', '@montflow', 'profiles', 'bad');
          yield* fs.makeDirectory(badDir, { recursive: true });
          yield* fs.writeFileString(
            join(badDir, 'PROFILE.md'),
            '---\nname: bad\ndescription: Missing the checklist.\n---\n\n# bad\n\n## Instructions\n\nDo things.\n',
          );
        }).pipe(
          Effect.mapError((error) => String(error)),
          Effect.provide(NodeLive),
        );

        const valid: Array<string> = [];
        yield* Cli.run('list --status valid', scriptedUi(valid), dir);
        Vitest.expect(valid.join('\n')).toContain('reviewer');
        Vitest.expect(valid.join('\n')).not.toContain('bad');

        const invalid: Array<string> = [];
        yield* Cli.run('list --status invalid', scriptedUi(invalid), dir);
        Vitest.expect(invalid.join('\n')).toContain('bad');
        Vitest.expect(invalid.join('\n')).not.toContain('reviewer');
      }),
    ),
  );
});
