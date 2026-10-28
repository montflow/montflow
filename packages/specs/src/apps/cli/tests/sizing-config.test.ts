import { NodeFileSystem, NodePath } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { PromptStore } from '@montflow/prompts';
import { Cause, Effect, FileSystem, Layer, Path } from 'effect';
import { runDoctor } from '../../../apps/doctor/index.js';
import { PromptError } from '../../../modules/prompt/index.js';
import {
  type SizingConfigOptions,
  type SizingScopeResolution,
  SurfaceError,
  diagnoseCause,
  resolveSizingScope,
  sizingConfig,
} from '../index.js';

/**
 * `sizing-config` renders the shipped sizing wizard for one config layer and
 * writes nothing. These tests pin the mechanical scope derivation, every
 * inconsistent flag combination, the doctor gate, and the no-write contract;
 * every run uses a throwaway workspace so no real `sizing.json` is created.
 */

const Platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);
const StoreLive = Layer.mergeAll(Layer.provide(PromptStore.Default, Platform), Platform);

/** Workspace root and the prompt store the loader reads. */
interface Work {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly dir: string;
}

const prepare = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-sizing-config-' });
  return { fs, path, dir };
});

/** Skills the sizing prompt declares but doctor does not ship. */
const FOREIGN_SKILLS = ['executing-skills', 'grilling', 'i-have-adhd'] as const;

/** Install the shipped prompts plus the foreign skills the prompt declares. */
const preparePrompts = (work: Work) =>
  Effect.gen(function* () {
    yield* runDoctor(work.dir);
    for (const name of FOREIGN_SKILLS) {
      const dir = work.path.join(work.dir, '.agents', 'skills', name);
      yield* work.fs.makeDirectory(dir, { recursive: true });
      yield* work.fs.writeFileString(
        work.path.join(dir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: fixture\n---\n`,
      );
    }
  });

/** Every file below `dir`, sorted, so a write anywhere is visible. */
const filesUnder = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
): Effect.Effect<ReadonlyArray<string>> =>
  fs.readDirectory(dir).pipe(
    Effect.flatMap((entries) =>
      Effect.forEach(entries, (entry) => {
        const target = path.join(dir, entry);
        return fs
          .stat(target)
          .pipe(
            Effect.flatMap((info) =>
              info.type === 'Directory'
                ? filesUnder(fs, path, target)
                : Effect.succeed<ReadonlyArray<string>>([target]),
            ),
          );
      }),
    ),
    Effect.map((nested) => nested.flat().toSorted()),
    Effect.orDie,
  );

const run = (work: Work, options: SizingConfigOptions = {}) =>
  sizingConfig(work.dir, options).pipe(Effect.provide(StoreLive));

/** Render any expected failure the same way the command boundary does. */
const diagnose = (error: PromptError | SurfaceError): string =>
  diagnoseCause(Cause.fail(error), {
    path: 'specs',
    rerun: 'mf-specs sizing-config',
    verbose: false,
  }).output;

/** The scope a resolution accepted, or a failed assertion. */
const accepted = (resolution: SizingScopeResolution) => {
  if (!resolution.ok) {
    throw new Error(`expected an accepted scope, got: ${resolution.diagnostic.problem}`);
  }
  return resolution.request;
};

/** The refusal a resolution produced, or a failed assertion. */
const refused = (resolution: SizingScopeResolution) => {
  if (resolution.ok) {
    throw new Error(`expected a refusal, got scope: ${String(resolution.request.scope)}`);
  }
  return resolution.diagnostic;
};

Vitest.describe('Cli.resolveSizingScope', () => {
  Vitest.it.effect('leaves the scope open with no flags or only blank scope and phase', () =>
    Effect.sync(() => {
      for (const options of [{}, { phase: '  ', scope: '' }] as const) {
        const request = accepted(resolveSizingScope(options));
        Vitest.expect(request).toStrictEqual({});
      }
    }),
  );

  Vitest.it.effect('implies spec from --name and phase from --name plus --phase', () =>
    Effect.sync(() => {
      Vitest.expect(accepted(resolveSizingScope({ name: 'ship-login' }))).toStrictEqual({
        scope: 'spec',
        name: 'ship-login',
      });
      Vitest.expect(accepted(resolveSizingScope({ name: 'ship-login', phase: 'A' }))).toStrictEqual(
        { scope: 'phase', name: 'ship-login', phase: 'A' },
      );
    }),
  );

  Vitest.it.effect('accepts every fixed scope, with --scope winning over the flags', () =>
    Effect.sync(() => {
      Vitest.expect(accepted(resolveSizingScope({ scope: 'repo' }))).toStrictEqual({
        scope: 'repo',
      });
      Vitest.expect(
        accepted(resolveSizingScope({ scope: 'spec', name: 'ship-login' })),
      ).toStrictEqual({ scope: 'spec', name: 'ship-login' });
      Vitest.expect(
        accepted(resolveSizingScope({ scope: 'phase', name: 'ship-login', phase: 'A' })),
      ).toStrictEqual({ scope: 'phase', name: 'ship-login', phase: 'A' });
    }),
  );

  Vitest.it.effect('trims identifiers and refuses a supplied but blank --name', () =>
    Effect.sync(() => {
      Vitest.expect(accepted(resolveSizingScope({ name: '  ship-login  ' }))).toStrictEqual({
        scope: 'spec',
        name: 'ship-login',
      });
      // Supplied but blank is a typo, not the open scope; omitting it is open.
      for (const options of [{ name: '' }, { name: '   ' }, { name: ' ', phase: 'A' }] as const) {
        const blank = refused(resolveSizingScope(options));
        Vitest.expect(blank.code).toBe('cli.invalid-argument');
        Vitest.expect(blank.field).toBe('--name');
        Vitest.expect(blank.problem).toContain('--name requires a spec name');
        Vitest.expect(blank.next).toContain('--name <spec>');
      }
      const missing = refused(resolveSizingScope({ scope: 'spec', name: '' }));
      Vitest.expect(missing.code).toBe('cli.invalid-argument');
      Vitest.expect(missing.field).toBe('--name');
      Vitest.expect(missing.next).toBe('mf-specs sizing-config --scope spec --name <spec>');
      const phase = refused(resolveSizingScope({ name: ' ', phase: 'A' }));
      Vitest.expect(phase.field).toBe('--name');
    }),
  );

  Vitest.it.effect('refuses --phase without --name and names the corrected command', () =>
    Effect.sync(() => {
      const found = refused(resolveSizingScope({ phase: 'A' }));
      Vitest.expect(found.code).toBe('cli.invalid-argument');
      Vitest.expect(found.field).toBe('--phase');
      Vitest.expect(found.problem).toContain('--phase requires --name');
      Vitest.expect(found.actual).toBe('--phase A');
      Vitest.expect(found.fix).toContain('mf-specs sizing-config --name <spec> --phase A');
      Vitest.expect(found.next).toBe('mf-specs sizing-config --name <spec> --phase A');
    }),
  );

  Vitest.it.effect('refuses --scope spec or phase without --name', () =>
    Effect.sync(() => {
      const spec = refused(resolveSizingScope({ scope: 'spec' }));
      Vitest.expect(spec.field).toBe('--scope');
      Vitest.expect(spec.problem).toContain('--scope spec requires --name');
      Vitest.expect(spec.next).toBe('mf-specs sizing-config --scope spec --name <spec>');

      const phase = refused(resolveSizingScope({ scope: 'phase' }));
      Vitest.expect(phase.problem).toContain('--scope phase requires --name');
      Vitest.expect(phase.next).toContain('--phase <id>');
    }),
  );

  Vitest.it.effect('refuses --scope phase without --phase', () =>
    Effect.sync(() => {
      const found = refused(resolveSizingScope({ scope: 'phase', name: 'ship-login' }));
      Vitest.expect(found.field).toBe('--scope');
      Vitest.expect(found.problem).toBe('--scope phase requires --phase <id>.');
      Vitest.expect(found.actual).toBe('--scope phase --name ship-login');
      Vitest.expect(found.next).toBe(
        'mf-specs sizing-config --scope phase --name ship-login --phase <id>',
      );
    }),
  );

  Vitest.it.effect('refuses a --scope that contradicts --name or --phase', () =>
    Effect.sync(() => {
      const repoName = refused(resolveSizingScope({ scope: 'repo', name: 'ship-login' }));
      Vitest.expect(repoName.problem).toContain('--scope repo sizes the repo config');
      Vitest.expect(repoName.actual).toContain('--name ship-login');
      Vitest.expect(repoName.next).toBe('mf-specs sizing-config --scope repo');

      const repoPhase = refused(
        resolveSizingScope({ scope: 'repo', name: 'ship-login', phase: 'A' }),
      );
      Vitest.expect(repoPhase.actual).toContain('--phase A');
      Vitest.expect(repoPhase.next).toBe('mf-specs sizing-config --scope repo');

      // No --name: the explicit scope still wins, so the corrected command
      // sizes the layer the caller asked for, not the inferred phase layer.
      const repoPhaseOnly = refused(resolveSizingScope({ scope: 'repo', phase: 'A' }));
      Vitest.expect(repoPhaseOnly.problem).toContain('--phase A was supplied');
      Vitest.expect(repoPhaseOnly.next).toBe('mf-specs sizing-config --scope repo');

      const specPhaseOnly = refused(resolveSizingScope({ scope: 'spec', phase: 'A' }));
      Vitest.expect(specPhaseOnly.problem).toContain('--phase A was supplied');
      Vitest.expect(specPhaseOnly.next).toContain('--scope spec');
      Vitest.expect(specPhaseOnly.next).not.toContain('--phase A');

      const specPhase = refused(
        resolveSizingScope({ scope: 'spec', name: 'ship-login', phase: 'A' }),
      );
      Vitest.expect(specPhase.problem).toContain('--phase A was supplied');
      Vitest.expect(specPhase.next).toBe('mf-specs sizing-config --scope spec --name ship-login');
    }),
  );

  Vitest.it.effect('refuses an unknown scope with the accepted values', () =>
    Effect.sync(() => {
      const found = refused(resolveSizingScope({ scope: 'workspace' }));
      Vitest.expect(found.code).toBe('cli.invalid-argument');
      Vitest.expect(found.field).toBe('--scope');
      Vitest.expect(found.problem).toBe("Unknown sizing scope 'workspace'.");
      Vitest.expect(found.expected).toBe('one of repo, spec, phase');
      Vitest.expect(found.actual).toBe('workspace');
      Vitest.expect(found.fix).toContain('--scope repo');
    }),
  );
});

Vitest.describe('Cli.sizingConfig runtime', () => {
  Vitest.it.effect('renders the open scope and its declared skills', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* preparePrompts(work);

      const report = yield* run(work);
      Vitest.expect(report.scope).toBeUndefined();
      Vitest.expect(report.name).toBeUndefined();
      Vitest.expect(report.phase).toBeUndefined();
      Vitest.expect(report.prompt.name).toBe('spec-sizing');
      Vitest.expect(report.prompt.text).toContain('Scope is open: no layer is selected.');
      Vitest.expect(report.prompt.text).toContain('Ask the user one question');
      Vitest.expect(report.prompt.skills).toStrictEqual([
        'executing-skills',
        'montflow-find-specs',
        'montflow-create-specs',
        'grilling',
        'i-have-adhd',
      ]);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('renders the repo scope and names the repo file only', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* preparePrompts(work);

      const report = yield* run(work, { scope: 'repo' });
      Vitest.expect(report.scope).toBe('repo');
      Vitest.expect(report.prompt.text).toContain(
        'Scope: repo (fixed for this run; do not ask which layer).',
      );
      Vitest.expect(report.prompt.text).toContain('`<specs-root>/sizing.json`');
      Vitest.expect(report.prompt.text).toContain('never a `phases` key');
      Vitest.expect(report.prompt.text).not.toContain('`repo` ->');
      Vitest.expect(report.prompt.text).not.toContain('`spec` ->');
      Vitest.expect(report.prompt.text).not.toContain('`phase` ->');
      Vitest.expect(report.prompt.text).not.toContain('Scope is open');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('renders the spec scope named by --name', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* preparePrompts(work);

      const report = yield* run(work, { name: 'ship-login' });
      Vitest.expect(report.scope).toBe('spec');
      Vitest.expect(report.name).toBe('ship-login');
      Vitest.expect(report.prompt.text).toContain(
        'Spec: ship-login. Its config is `ship-login/sizing.json`.',
      );
      Vitest.expect(report.prompt.text).toContain('The scope is fixed for this run: `spec`.');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('renders the phase scope with its nested write target', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* preparePrompts(work);

      const report = yield* run(work, { name: 'ship-login', phase: 'A' });
      Vitest.expect(report.scope).toBe('phase');
      Vitest.expect(report.phase).toBe('A');
      Vitest.expect(report.prompt.text).toContain(
        'Phase: A. The write target is `phases.A.sizes` inside `ship-login/sizing.json`.',
      );
      Vitest.expect(report.prompt.text).toContain('The scope is fixed for this run: `phase`.');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('defaults to guided and renders the autonomous branch only for autonomous', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* preparePrompts(work);

      const guided = yield* run(work, { scope: 'repo' });
      Vitest.expect(guided.prompt.text).toContain('Guided run: wait for the user');
      Vitest.expect(guided.prompt.text).not.toContain('Autonomous run:');

      const autonomous = yield* run(work, { scope: 'repo', mode: 'autonomous' });
      Vitest.expect(autonomous.prompt.text).toContain('Autonomous run: decide the scope');
      Vitest.expect(autonomous.prompt.text).not.toContain('Guided run: wait for the user');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('carries an optional focus verbatim', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* preparePrompts(work);

      const report = yield* run(work, {
        name: 'ship-login',
        focus: 'Prefer the cheapest capable model.',
      });
      Vitest.expect(report.prompt.text).toContain(
        'Steer this run with this focus: Prefer the cheapest capable model.',
      );
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('rejects an unknown mode before the prompt gate', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      // No doctor install: the flag error must win over the missing prompt.
      const error = yield* run(work, { scope: 'repo', mode: 'autopilot' }).pipe(Effect.flip);
      const text = diagnose(error);
      Vitest.expect(text).toContain('code     prompt.mode');
      Vitest.expect(text).toContain('path     --mode');
      Vitest.expect(text).toContain('expected one of guided, autonomous');
      Vitest.expect(text).toContain('actual   autopilot');
      Vitest.expect(text).not.toContain('prompt.missing');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a conflict before the prompt gate and names the fix', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const error = yield* run(work, { phase: 'A' }).pipe(Effect.flip);
      const text = diagnose(error);
      Vitest.expect(text).toContain('code     cli.invalid-argument');
      Vitest.expect(text).toContain('field    --phase');
      Vitest.expect(text).toContain('--phase requires --name');
      Vitest.expect(text).toContain('fix      Pass --name');
      Vitest.expect(text).not.toContain('prompt.missing');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a missing spec-sizing prompt with code, path, and fix', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const error = yield* run(work, { scope: 'repo' }).pipe(Effect.flip);
      const text = diagnose(error);
      Vitest.expect(text).toContain('code     prompt.missing');
      Vitest.expect(text).toContain('spec-sizing.json');
      Vitest.expect(text).toContain('fix      Run mf-specs doctor');
      Vitest.expect(text).toContain('not installed');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a stale spec-sizing prompt with code, path, and fix', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* preparePrompts(work);
      const target = work.path.join(
        work.dir,
        '.agents',
        '@montflow',
        'prompts',
        'spec-sizing.json',
      );
      yield* work.fs.writeFileString(target, '{"name":"spec-sizing","stale":true}\n');

      const error = yield* run(work, { name: 'ship-login' }).pipe(Effect.flip);
      const text = diagnose(error);
      Vitest.expect(text).toContain('code     prompt.stale');
      Vitest.expect(text).toContain(target);
      Vitest.expect(text).toContain('fix      Run mf-specs doctor');
      Vitest.expect(text).toContain('differs from the package');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('renders for every scope without writing a file', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* preparePrompts(work);
      const before = yield* filesUnder(work.fs, work.path, work.dir);

      for (const options of [
        {},
        { scope: 'repo' },
        { name: 'ship-login' },
        { name: 'ship-login', phase: 'A' },
      ] as const) {
        yield* run(work, options);
      }

      const after = yield* filesUnder(work.fs, work.path, work.dir);
      Vitest.expect(after).toStrictEqual(before);
      Vitest.expect(after.some((file) => work.path.basename(file) === 'sizing.json')).toBe(false);
    }).pipe(Effect.provide(StoreLive)),
  );
});
