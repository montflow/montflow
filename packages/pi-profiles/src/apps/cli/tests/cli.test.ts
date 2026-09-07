import { NodeFileSystem, NodePath } from '@effect/platform-node';
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
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-profiles-cli-' });
      return yield* fn(dir).pipe(Effect.provide(TestLive));
    }).pipe(
      Effect.provide(NodeLive),
      Effect.mapError((error) => String(error)),
    ),
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
            'create code-reviewer --description "Reviews code" --model anthropic/m --skills authoring-profiles --instructions "Be strict." --checklist "Flag issues; Cite files"',
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
      Vitest.expect(notifies[1]).toContain('skills: authoring-profiles');
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
          const missing = yield* Effect.flip(Cli.run('create x', ui, dir)).pipe(
            Effect.mapError(() => 'should have failed'),
          );
          Vitest.expect(missing).toContain('--description');
          const badSlug = yield* Effect.flip(
            Cli.run('create "Bad Name" --description d', ui, dir),
          ).pipe(Effect.mapError(() => 'should have failed'));
          Vitest.expect(badSlug).toContain('kebab-case');
          const unknown = yield* Effect.flip(Cli.run('show nope', ui, dir)).pipe(
            Effect.mapError(() => 'should have failed'),
          );
          Vitest.expect(unknown).toContain("Unknown profile 'nope'");
        }),
      );
    }),
  );
});
