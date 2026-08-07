import { test, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createEventBus,
  type EventBus,
  type ExtensionAPI,
  type ExtensionContext,
  type ModelRegistry,
} from '@earendil-works/pi-coding-agent';
import type { Model } from '@earendil-works/pi-ai';
import {
  defaultSettings,
  parseFilesInput,
  parsePositiveInt,
  renderPresetGraphic,
  runInteractiveSetup,
  settingsMenuItems,
  type ReviewScope,
} from '../interactive';
import { buildScopeClause } from '../graph';
import type { LoopOptions } from '../graph';
import type { Profile } from '../profiles-client';

// ─── parseFilesInput ──────────────────────────────────────────────────

const makeCwd = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arl-interactive-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'auth.ts'), '');
  fs.writeFileSync(path.join(dir, 'README.md'), '');
  return dir;
};

const dir = makeCwd();

/** Seeds a minimal preset file into a fresh temp cwd. */
const seedPreset = (d: string): void => {
  fs.mkdirSync(path.join(d, '.agents/review-presets'), { recursive: true });
  fs.writeFileSync(path.join(d, '.agents/review-presets/x.json'), '{}');
};

// F14: the module-level temp dir is shared by every test in this file (they
// seed presets/reviews into it), so it must be cleaned up after the suite —
// otherwise each run leaks an `arl-interactive-*` directory under os.tmpdir().
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

test('parseFilesInput: existing paths become files + scope', () => {
  const scope = parseFilesInput(dir, 'src/auth.ts README.md');
  expect(scope.mode).toBe('files');
  expect(scope.files).toEqual(['src/auth.ts', 'README.md']);
  expect(scope.scope).toContain('src/auth.ts');
});

test('parseFilesInput: ignores non-existing tokens but folds them into the scope', () => {
  const scope = parseFilesInput(dir, 'src/auth.ts the auth flow');
  expect(scope.files).toEqual(['src/auth.ts']);
  expect(scope.scope).toContain('src/auth.ts');
  expect(scope.scope).toContain('the auth flow');
});

test('parseFilesInput: no existing token → free-form focus prompt', () => {
  const scope = parseFilesInput(dir, 'Review the login flow for regressions');
  expect(scope.mode).toBe('files');
  expect(scope.files).toEqual([]);
  expect(scope.scope).toBe('Review the login flow for regressions');
});

test('parseFilesInput: commas are separators', () => {
  const scope = parseFilesInput(dir, 'src/auth.ts, README.md');
  expect(scope.files).toEqual(['src/auth.ts', 'README.md']);
});

test('parseFilesInput: empty input → empty scope', () => {
  const scope = parseFilesInput(dir, '   ');
  expect(scope).toEqual<ReviewScope>({ mode: 'files', scope: '', files: [] });
});

test('parseFilesInput: "." selects the whole directory', () => {
  const scope = parseFilesInput(dir, '.');
  expect(scope.mode).toBe('directory');
  expect(scope.files).toEqual([]);
  expect(scope.scope).toContain('entire directory');
});

// ─── parsePositiveInt ────────────────────────────────────────────────

test('parsePositiveInt: accepts positive integers', () => {
  expect(parsePositiveInt('5')).toBe(5);
  expect(parsePositiveInt(' 12 ')).toBe(12);
});

test('parsePositiveInt: rejects zero, negatives, decimals, and junk', () => {
  expect(parsePositiveInt('0')).toBeUndefined();
  expect(parsePositiveInt('-3')).toBeUndefined();
  expect(parsePositiveInt('2.5')).toBeUndefined();
  expect(parsePositiveInt('abc')).toBeUndefined();
  expect(parsePositiveInt('')).toBeUndefined();
  expect(parsePositiveInt('   ')).toBeUndefined();
});

// ─── defaultSettings / settingsMenuItems ─────────────────────────────

test('defaultSettings: mirrors the default loop config', () => {
  const settings = defaultSettings();
  expect(settings.maxLoops).toBeGreaterThan(0);
  expect(settings.maxCycles).toBeGreaterThan(0);
  expect(settings.fixerModel.trim()).not.toBe('');
  expect(settings.supervisorModel.trim()).not.toBe('');
  expect(settings.deadlockFlipThreshold).toBeGreaterThan(0);
});

test('settingsMenuItems: shows current values and the done action', () => {
  const settings = defaultSettings();
  const items = settingsMenuItems(settings);
  expect(items.some((item) => item.startsWith('Max loops'))).toBe(true);
  expect(items.some((item) => item.startsWith('Max cycles'))).toBe(true);
  expect(items.some((item) => item.startsWith('Fixer model'))).toBe(true);
  expect(items.some((item) => item.startsWith('Fixer fallback models'))).toBe(true);
  expect(items.some((item) => item.startsWith('Supervisor model'))).toBe(true);
  expect(items.some((item) => item.startsWith('Supervisor fallback models'))).toBe(true);
  expect(items.some((item) => item.startsWith('Deadlock flip threshold'))).toBe(true);
  expect(items.some((item) => item.startsWith('Fixer concurrency'))).toBe(true);
  expect(items[items.length - 1]).toBe('✓ Done — start review');
  expect(items[0]).toContain(String(settings.maxLoops));
  expect(items[1]).toContain(String(settings.maxCycles));
  expect(settings.agentConcurrency).toBe(5);
  // Fallback lists default to empty ("none") and render in the menu.
  expect(settings.fixerFallbackModels).toEqual([]);
  expect(settings.supervisorFallbackModels).toEqual([]);
  expect(items.some((item) => item.startsWith('Fixer fallback models') && item.includes('none'))).toBe(true);
  expect(items.some((item) => item.startsWith('Supervisor fallback models') && item.includes('none'))).toBe(true);
});

// ─── buildScopeClause ────────────────────────────────────────────────

const baseOpts = (): LoopOptions => ({
  reviewerModel: 'r',
  fixerModel: 'f',
  maxLoops: 3,
  targetDir: '/tmp',
  reviewName: 'adversarial',
  fresh: false,
  config: {} as LoopOptions['config'],
});

test('buildScopeClause: empty when no scope is set', () => {
  expect(buildScopeClause(baseOpts())).toBe('');
});

test('buildScopeClause: includes diff path, files, and free-form scope', () => {
  const clause = buildScopeClause({
    ...baseOpts(),
    scopeDiffPath: '/tmp/reviews/001/scope.diff',
    scopeFiles: ['src/auth.ts'],
    reviewScope: 'Review ONLY the unstaged changes.',
  });
  expect(clause).toContain('/tmp/reviews/001/scope.diff');
  expect(clause).toContain('src/auth.ts');
  expect(clause).toContain('Review ONLY the unstaged changes.');
});

test('buildScopeClause: skips blank scope fields', () => {
  const clause = buildScopeClause({ ...baseOpts(), reviewScope: '  ' });
  expect(clause).toBe('');
});

// ─── Wizard roster flow (scripted UI) ────────────────────────────────

const sampleProfile = (): Profile => ({
  name: 'security-auditor',
  description: 'You are a security-focused reviewer.',
  model: 'anthropic/claude-sonnet-4-5',
  skills: ['adversarial-review'],
  instructions: 'Assume the author made mistakes.',
  checklist: [],
});

interface SelectCall {
  readonly title: string;
  readonly options: readonly string[];
}

/** Scripted UI: select/input/custom resolve queued values, every call is recorded. */
const makeUi = (script: {
  selects: readonly string[];
  customs: readonly string[];
  inputs: readonly string[];
}) => {
  const selects = [...script.selects];
  const customs = [...script.customs];
  const inputs = [...script.inputs];
  const calls: SelectCall[] = [];
  return {
    calls,
    ui: {
      select: async (title: string, options: readonly string[]) => {
        calls.push({ title, options });
        const next = selects.shift();
        if (next === undefined) throw new Error(`ui.select called too many times: ${title}`);
        if (!options.includes(next)) {
          throw new Error(`scripted pick '${next}' not offered: ${options.join(' | ')}`);
        }
        return next;
      },
      input: async (_title: string, _prefill?: string) => {
        const next = inputs.shift();
        if (next === undefined) throw new Error('ui.input called too many times');
        return next;
      },
      custom: async <T>(_fn: unknown): Promise<T> => {
        const next = customs.shift();
        if (next === undefined) throw new Error('ui.custom called too many times');
        return next as T;
      },
      notify: () => {},
      confirm: async () => false,
    } as unknown as ExtensionContext['ui'],
  };
};

const fakePi = (events: EventBus): ExtensionAPI =>
  ({
    events,
    getCommands: () => [{ name: 'profiles', source: 'extension' as const }],
  }) as unknown as ExtensionAPI;

/** Registers a fake profiles server that answers from the given profiles. */
const serveProfiles = (pi: ExtensionAPI, profiles: readonly Profile[]): void => {
  pi.events.on('profiles:list', (data) => {
    const request = data as { id: string };
    pi.events.emit('profiles:list:result', {
      id: request.id,
      ok: true,
      names: profiles.map((profile) => profile.name),
    });
  });
  pi.events.on('profiles:get', (data) => {
    const request = data as { id: string; name: string };
    const profile = profiles.find((candidate) => candidate.name === request.name);
    pi.events.emit(
      'profiles:get:result',
      profile === undefined
        ? { id: request.id, ok: false, error: `Profile not found: ${request.name}` }
        : { id: request.id, ok: true, profile },
    );
  });
};

const makeCtx = (cwd: string, ui: ExtensionContext['ui']): ExtensionContext =>
  ({
    cwd,
    ui,
    hasUI: true,
    mode: 'tui',
    model: { provider: 'deepseek', id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' } as unknown as Model<any>,
    scopedModels: [],
    modelRegistry: {
      getAvailable: () => [
        { provider: 'deepseek', id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
        { provider: 'anthropic', id: 'claude-sonnet-4-5', name: 'Claude 4 Sonnet' },
      ],
    } as unknown as ModelRegistry,
  }) as unknown as ExtensionContext;

test('create preset: added profile reviewer lands in the roster and menu reflects it', async () => {
  const events = createEventBus();
  const pi = fakePi(events);
  serveProfiles(pi, [sampleProfile()]);

  const { ui, calls } = makeUi({
    selects: [
      'Preset',
      'Create preset',
      '+ Add reviewer (profile)',
      '✓ Done — choose settings',
      '✓ Done — create preset',
      'Exit', // post-create: leave the wizard
    ],
    // Profile pick and model pick both use custom components.
    customs: ['security-auditor', 'deepseek/deepseek-v4-pro'],
    inputs: ['roster-audit'],
  });

  const setup = await runInteractiveSetup(pi, makeCtx(dir, ui));
  expect(setup).toBeNull(); // exited after creating the preset

  // Roster menu titles reflect the growing roster: [1] then [2].
  const rosterMenus = calls.filter((call) => call.title.startsWith('Reviewers ['));
  expect(rosterMenus.map((call) => call.title)).toEqual([
    'Reviewers [1]: Generic (deepseek-v4-pro)',
    'Reviewers [2]: Generic (deepseek-v4-pro), Security Auditor (deepseek/deepseek-v4-pro)',
  ]);

  // Remove-reviewer is hidden at size 1, present at size 2.
  expect(rosterMenus[0]?.options).not.toContain('− Remove reviewer');
  expect(rosterMenus[1]?.options).toContain('− Remove reviewer');

  // Both reviewers were persisted as references.
  const stored = JSON.parse(
    fs.readFileSync(path.join(dir, '.agents/review-presets/roster-audit.json'), 'utf8'),
  ) as { config: { reviewers: unknown[] } };
  expect(stored.config.reviewers).toEqual([
    { type: 'builtin', id: 'generic' },
    { type: 'profile', name: 'security-auditor', model: 'deepseek/deepseek-v4-pro' },
  ]);
});

test('wizard: cancel at the action menu aborts the setup', async () => {
  const events = createEventBus();
  const pi = fakePi(events);
  serveProfiles(pi, [sampleProfile()]);

  // The action menu resolves undefined (cancel) and the user confirms.
  const cancelledUi = {
    select: async (_title: string, _options: readonly string[]) => undefined,
    input: async () => 'src/auth.ts',
    custom: async <T>(_fn: unknown): Promise<T> => undefined as T,
    notify: () => {},
    confirm: async () => true,
  } as unknown as ExtensionContext['ui'];

  const setup = await runInteractiveSetup(pi, makeCtx(dir, cancelledUi));
  expect(setup).toBeNull();
});

// ─── Preset flows ────────────────────────────────────────────────────

test('preset flow: create a preset, then run a review with it via New review', async () => {
  const events = createEventBus();
  const pi = fakePi(events);
  serveProfiles(pi, [sampleProfile()]);

  const { ui } = makeUi({
    selects: [
      'Preset', // action menu
      'Create preset', // preset submenu
      '✓ Done — choose settings', // roster (default generic)
      '✓ Done — create preset', // settings (defaults)
      'Continue', // post-create: keep managing presets
      '← Back', // preset submenu → action menu
      'New review', // running a review requires a preset now
      'Pick — files/directories or a focus prompt', // scope
    ],
    // New review: preset pick + scope input both use custom dialogs.
    customs: ['my-preset', 'src/auth.ts'],
    inputs: ['my-preset'], // preset name
  });
  const ctx = makeCtx(dir, ui);

  const setup = await runInteractiveSetup(pi, ctx);
  expect(setup).not.toBeNull();
  if (setup === null) return;

  // The preset file was persisted with the created configuration. Reviewers
  // are stored as references — a compact builtin ref, not the expanded profile.
  const presetFile = path.join(dir, '.agents/review-presets/my-preset.json');
  expect(fs.existsSync(presetFile)).toBe(true);
  const stored = JSON.parse(fs.readFileSync(presetFile, 'utf8')) as {
    version: number;
    name: string;
    config: { reviewers: unknown[]; supervisor: { model: string } };
  };
  expect(stored.version).toBe(1);
  expect(stored.name).toBe('my-preset');
  expect(stored.config.reviewers).toEqual([{ type: 'builtin', id: 'generic' }]);
  // Supervisor stores only the model — skill paths are derived at load.
  expect('skillPath' in stored.config.supervisor).toBe(false);

  // The review runs with the preset's resolved config + the scope chosen at
  // run time (presets store no path).
  const reviewers = setup.opts.config.reviewers.map((reviewer) => reviewer.id);
  expect(reviewers).toEqual(['generic']);
  expect(setup.opts.config.maxLoops).toBeGreaterThan(0);
  expect(setup.opts.scopeFiles).toEqual(['src/auth.ts']);
  expect(setup.opts.reviewName).toBe('adversarial');
});

test('preset flow: profile reviewers are stored as references and resolved on use', async () => {
  const events = createEventBus();
  const pi = fakePi(events);
  serveProfiles(pi, [sampleProfile()]);

  const { ui } = makeUi({
    selects: [
      'Preset',
      'Create preset',
      '+ Add reviewer (profile)', // add the profile to the roster
      '✓ Done — choose settings',
      '✓ Done — create preset',
      'Continue',
      '← Back', // preset submenu → action menu
      'New review',
      'Pick — files/directories or a focus prompt',
    ],
    // create: profile pick + model pick; new review: preset pick + scope input
    customs: ['security-auditor', 'deepseek/deepseek-v4-pro', 'ref-preset', 'src/auth.ts'],
    inputs: ['ref-preset'],
  });

  const setup = await runInteractiveSetup(pi, makeCtx(dir, ui));
  expect(setup).not.toBeNull();
  if (setup === null) return;

  // The stored file references the profile by name — no expanded profile data.
  const stored = JSON.parse(
    fs.readFileSync(path.join(dir, '.agents/review-presets/ref-preset.json'), 'utf8'),
  ) as { config: { reviewers: unknown[] } };
  expect(stored.config.reviewers).toEqual([
    { type: 'builtin', id: 'generic' },
    { type: 'profile', name: 'security-auditor', model: 'deepseek/deepseek-v4-pro' },
  ]);

  // On use, the profile reference resolves back to the full reviewer, with the
  // objective coming from the profile (not baked into the preset).
  const reviewers = setup.opts.config.reviewers;
  expect(reviewers.map((reviewer) => reviewer.id)).toEqual(['generic', 'security-auditor']);
  expect(reviewers[1]?.objective).toContain('security-focused');
  expect(reviewers[1]?.model).toBe('deepseek/deepseek-v4-pro');
  expect(setup.opts.config.supervisor.skillPath).toContain('adversarial-review-supervisor');
});

test('preset flow: cancel at the preset submenu aborts the setup', async () => {
  const events = createEventBus();
  const pi = fakePi(events);

  let calls = 0;
  const cancelledUi = {
    select: async (_title: string, _options: readonly string[]) => {
      calls += 1;
      return calls === 1 ? 'Preset' : undefined;
    },
    input: async () => 'x',
    custom: async <T>(_fn: unknown): Promise<T> => undefined as T,
    notify: () => {},
    confirm: async () => true,
  } as unknown as ExtensionContext['ui'];

  const setup = await runInteractiveSetup(pi, makeCtx(dir, cancelledUi));
  expect(setup).toBeNull();
  expect(calls).toBe(2);
});

test('preset flow: creating an existing preset name refuses and aborts', async () => {
  const events = createEventBus();
  const pi = fakePi(events);

  // Seed an existing preset file directly (create flow only checks existence).
  const presetFile = path.join(dir, '.agents/review-presets/existing.json');
  fs.mkdirSync(path.dirname(presetFile), { recursive: true });
  const original = '{"version":1,"name":"existing","config":{}}';
  fs.writeFileSync(presetFile, original);

  let calls = 0;
  const ui = {
    select: async (_title: string, _options: readonly string[]) => {
      calls += 1;
      if (calls === 1) return 'Preset';
      if (calls === 2) return 'Create preset';
      return undefined;
    },
    input: async () => 'existing',
    custom: async <T>(_fn: unknown): Promise<T> => undefined as T,
    notify: () => {},
    confirm: async () => true,
  } as unknown as ExtensionContext['ui'];

  const setup = await runInteractiveSetup(pi, makeCtx(dir, ui));
  expect(setup).toBeNull();
  // Refusing to overwrite kept the original file intact.
  expect(fs.readFileSync(presetFile, 'utf8')).toBe(original);
});

// ─── Back navigation ────────────────────────────────────────────────

/**
 * Scripted UI whose select picks are taken from a queue that tolerates
 * explicit `undefined` entries (cancel at the end).
 */
const scriptedSelectUi = (picks: ReadonlyArray<string | undefined>) => {
  const selects = [...picks];
  return {
    ui: {
      select: async (_title: string, options: readonly string[]) => {
        const next = selects.shift();
        if (next === undefined) return undefined;
        if (!options.includes(next)) {
          throw new Error(`scripted pick '${next}' not offered: ${options.join(' | ')}`);
        }
        return next;
      },
      input: async () => 'x',
      custom: async <T>(_fn: unknown): Promise<T> => undefined as T,
      notify: () => {},
      confirm: async () => true,
    } as unknown as ExtensionContext['ui'],
  };
};

test('back: preset submenu ← Back returns to the action menu', async () => {
  const { ui } = scriptedSelectUi(['Preset', '← Back', undefined]);
  const setup = await runInteractiveSetup(fakePi(createEventBus()), makeCtx(dir, ui));
  expect(setup).toBeNull();
});

test('back: new review — scope ← Back returns to the action menu', async () => {
  // Seed a preset so "New review" is offered.
  const presetFile = path.join(dir, '.agents/review-presets/scope-back.json');
  fs.mkdirSync(path.dirname(presetFile), { recursive: true });
  fs.writeFileSync(
    presetFile,
    JSON.stringify({
      version: 1,
      name: 'scope-back',
      config: {
        reviewers: [{ type: 'builtin', id: 'generic' }],
        supervisor: { model: 'm' },
        fixerModel: 'f',
        maxLoops: 3,
        deadlock: { flipThreshold: 2, action: 'escalate' },
      },
    }),
  );

  const { ui } = scriptedUi(
    ['New review', '← Back', undefined], // action → scope back → action cancel
    ['scope-back'], // custom: preset pick
    [],
  );
  const setup = await runInteractiveSetup(fakePi(createEventBus()), makeCtx(dir, ui));
  expect(setup).toBeNull();
});

test('back: settings ← Back returns to the roster (create preset)', async () => {
  const { ui } = scriptedUi(
    [
      'Preset',
      'Create preset',
      '✓ Done — choose settings',
      '← Back',
      '✓ Done — choose settings',
      '✓ Done — create preset',
      'Exit',
    ],
    [],
    ['settings-back'],
  );

  const setup = await runInteractiveSetup(fakePi(createEventBus()), makeCtx(dir, ui));
  expect(setup).toBeNull();
  // The preset was saved after re-building the roster.
  const presetFile = path.join(dir, '.agents/review-presets/settings-back.json');
  expect(fs.existsSync(presetFile)).toBe(true);
});

test('action menu: New review is hidden when no presets exist', async () => {
  // Fresh directory — no presets exist yet.
  const freshDir = makeCwd();
  const actionOptions: string[] = [];
  let call = 0;
  const ui = {
    select: async (_title: string, options: readonly string[]) => {
      call += 1;
      if (call === 1) actionOptions.push(...options);
      return undefined;
    },
    input: async () => 'x',
    custom: async <T>(_fn: unknown): Promise<T> => undefined as T,
    notify: () => {},
    confirm: async () => true,
  } as unknown as ExtensionContext['ui'];

  const setup = await runInteractiveSetup(fakePi(createEventBus()), makeCtx(freshDir, ui));
  expect(setup).toBeNull();
  expect(actionOptions).toEqual(['Preset']);
});

test('action menu: Resume review appears only when reviews exist', async () => {
  const recordMenu = async (seed: (d: string) => void): Promise<string[]> => {
    const freshDir = makeCwd();
    seed(freshDir);
    const options: string[] = [];
    let call = 0;
    const ui = {
      select: async (_title: string, opts: readonly string[]) => {
        call += 1;
        if (call === 1) options.push(...opts);
        return undefined;
      },
      input: async () => 'x',
      custom: async <T>(_fn: unknown): Promise<T> => undefined as T,
      notify: () => {},
      confirm: async () => true,
    } as unknown as ExtensionContext['ui'];
    await runInteractiveSetup(fakePi(createEventBus()), makeCtx(freshDir, ui));
    return options;
  };

  // No presets, no reviews → only Preset.
  expect(await recordMenu(() => {})).toEqual(['Preset']);
  // A preset but no reviews → New review + Preset (no Resume).
  expect(await recordMenu(seedPreset)).toEqual(['New review', 'Preset']);
  // A review but no preset → only Preset (Resume needs a config source too).
  expect(
    await recordMenu((d) => {
      fs.mkdirSync(path.join(d, '.agents/reviews/adversarial'), { recursive: true });
      fs.writeFileSync(path.join(d, '.agents/reviews/adversarial/001.md'), '# Review\n');
    }),
  ).toEqual(['Preset']);
  // A preset + an existing review → New review + Resume review + Preset.
  expect(
    await recordMenu((d) => {
      seedPreset(d);
      fs.mkdirSync(path.join(d, '.agents/reviews/adversarial'), { recursive: true });
      fs.writeFileSync(path.join(d, '.agents/reviews/adversarial/001.md'), '# Review\n');
    }),
  ).toEqual(['New review', 'Resume review', 'Preset']);
});

test('resume flow: uses the review locked-in config (no preset pick)', async () => {
  // Seed a review whose loop-state snapshots its config.
  const reviewDir = path.join(dir, '.agents/reviews/adversarial');
  fs.mkdirSync(reviewDir, { recursive: true });
  const reviewFile = path.join(reviewDir, '002.md');
  fs.writeFileSync(
    reviewFile,
    `# Review\n\n## Summary\n- **Open**: 2\n- **In Review**: 0\n- **Escalated**: 0\n- **Resolved**: 0\n- **Won't Fix**: 0\n`,
  );
  const stateDir = path.join(reviewDir, '002');
  fs.mkdirSync(stateDir, { recursive: true });
  const lockedConfig = {
    reviewers: [
      { id: 'generic', label: 'Generic', model: 'locked-model', skillPath: '/s', objective: 'o', focus: 'o' },
    ],
    supervisor: { model: 'sup-model', skillPath: '/s2' },
    fixerModel: 'fix-model',
    maxLoops: 7,
    deadlock: { flipThreshold: 2, action: 'escalate' },
  };
  fs.writeFileSync(
    path.join(stateDir, 'loop-state.json'),
    JSON.stringify({
      version: 1,
      cycle: 2,
      roster: ['generic'],
      findings: {},
      conflicts: [],
      deadlocks: [],
      config: lockedConfig,
    }),
  );

  const { ui } = makeUi({
    selects: ['Resume review', 'Resume with current config'],
    // Only the review pick uses a custom dialog — the config comes from the
    // review's snapshot, so NO preset picker runs (a preset pick here would
    // exhaust the custom queue and fail the test).
    customs: ['002.md'],
    inputs: [],
  });

  const setup = await runInteractiveSetup(fakePi(createEventBus()), makeCtx(dir, ui));
  expect(setup).not.toBeNull();
  if (setup === null) return;

  expect(setup.opts.fresh).toBe(false);
  expect(setup.opts.reviewFile).toBe(reviewFile);
  // The locked-in config wins — not anything the user might have picked now.
  expect(setup.opts.config.reviewers[0]?.model).toBe('locked-model');
  expect(setup.opts.config.supervisor.model).toBe('sup-model');
  expect(setup.opts.config.fixerModel).toBe('fix-model');
  expect(setup.opts.config.maxLoops).toBe(7);
});

test('resume flow: modify config before resuming — fallback models persist into the review snapshot', async () => {
  // Seed a review with a locked config snapshot, then modify it on resume:
  // add a fallback model chain to the reviewer. The modified config must
  // (a) drive the resumed run and (b) be written back into loop-state.json.
  const reviewDir = path.join(dir, '.agents/reviews/adversarial');
  fs.mkdirSync(reviewDir, { recursive: true });
  const reviewFile = path.join(reviewDir, '003.md');
  fs.writeFileSync(
    reviewFile,
    `# Review\n\n## Summary\n- **Open**: 1\n- **In Review**: 0\n- **Escalated**: 0\n- **Resolved**: 0\n- **Won't Fix**: 0\n`,
  );
  const stateDir = path.join(reviewDir, '003');
  fs.mkdirSync(stateDir, { recursive: true });
  const lockedConfig = {
    reviewers: [
      { id: 'generic', label: 'Generic', model: 'locked-model', skillPath: '/s', objective: 'o', focus: 'o' },
    ],
    supervisor: { model: 'sup-model', skillPath: '/s2' },
    fixerModel: 'fix-model',
    maxLoops: 7,
    deadlock: { flipThreshold: 2, action: 'escalate' },
  };
  fs.writeFileSync(
    path.join(stateDir, 'loop-state.json'),
    JSON.stringify({
      version: 1,
      cycle: 2,
      roster: ['generic'],
      findings: {},
      conflicts: [],
      deadlocks: [],
      config: lockedConfig,
    }),
  );

  const { ui } = makeUi({
    selects: [
      'Resume review',
      'Modify config before resuming',
      // Roster editor: add a fallback chain to the reviewer, then done.
      '~ Fallback models of a reviewer',
      'Generic (locked-model)',
      '+ Add a fallback model',
      '← Back',
      '✓ Done — choose settings',
      // Settings editor: done (settings unchanged).
      '✓ Done — resume review',
    ],
    // Review pick + the model pick for the fallback chain.
    customs: ['003.md', 'anthropic/claude-sonnet-4-5'],
    inputs: [],
  });

  const setup = await runInteractiveSetup(fakePi(createEventBus()), makeCtx(dir, ui));
  expect(setup).not.toBeNull();
  if (setup === null) return;

  // The review resumes with the MODIFIED config: the reviewer now has a
  // fallback model chain, everything else stays locked.
  expect(setup.opts.fresh).toBe(false);
  expect(setup.opts.reviewFile).toBe(reviewFile);
  expect(setup.opts.config.reviewers[0]?.model).toBe('locked-model');
  expect(setup.opts.config.reviewers[0]?.fallbackModels).toEqual(['anthropic/claude-sonnet-4-5']);
  expect(setup.opts.config.fixerModel).toBe('fix-model');
  expect(setup.opts.config.maxLoops).toBe(7);
  // The snapshot in loop-state.json was updated — later resumes keep it.
  const state = JSON.parse(fs.readFileSync(path.join(stateDir, 'loop-state.json'), 'utf8')) as {
    config?: { reviewers?: Array<{ fallbackModels?: string[] }> };
  };
  expect(state.config?.reviewers?.[0]?.fallbackModels).toEqual(['anthropic/claude-sonnet-4-5']);
});

test('resume flow: legacy review without config snapshot falls back to a preset', async () => {
  // Seed a review (with loop state but NO config snapshot) + a preset.
  const reviewDir = path.join(dir, '.agents/reviews/adversarial');
  fs.mkdirSync(reviewDir, { recursive: true });
  const reviewFile = path.join(reviewDir, '001.md');
  fs.writeFileSync(
    reviewFile,
    `# Review\n\n## Summary\n- **Open**: 1\n- **In Review**: 0\n- **Escalated**: 0\n- **Resolved**: 0\n- **Won't Fix**: 0\n`,
  );
  const stateDir = path.join(reviewDir, '001');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'loop-state.json'),
    JSON.stringify({
      version: 1,
      cycle: 2,
      roster: ['generic'],
      findings: {},
      conflicts: [],
      deadlocks: [],
    }),
  );
  const presetFile = path.join(dir, '.agents/review-presets/resume-preset.json');
  fs.mkdirSync(path.dirname(presetFile), { recursive: true });
  fs.writeFileSync(
    presetFile,
    JSON.stringify({
      version: 1,
      name: 'resume-preset',
      config: {
        reviewers: [{ type: 'builtin', id: 'generic' }],
        supervisor: { model: 'm' },
        fixerModel: 'f',
        maxLoops: 5,
        deadlock: { flipThreshold: 2, action: 'escalate' },
      },
    }),
  );

  const { ui } = makeUi({
    selects: ['Resume review'],
    // review picker + preset picker both use custom dialogs
    customs: ['001.md', 'resume-preset'],
    inputs: [],
  });

  const setup = await runInteractiveSetup(fakePi(createEventBus()), makeCtx(dir, ui));
  expect(setup).not.toBeNull();
  if (setup === null) return;

  // Resume runs in place: fresh=false against the chosen review file.
  expect(setup.opts.fresh).toBe(false);
  expect(setup.opts.reviewFile).toBe(reviewFile);
  expect(setup.opts.reviewName).toBe('adversarial');
  const reviewers = setup.opts.config.reviewers.map((reviewer) => reviewer.id);
  expect(reviewers).toEqual(['generic']);
  // Legacy preset had no concurrency → resolution applies the default.
  expect(setup.opts.config.agentConcurrency).toBe(5);
});

test('back: inside create preset, ← Back abandons without saving', async () => {
  const { ui } = scriptedSelectUi([
    'Preset',
    'Create preset',
    '✓ Done — choose settings',
    '← Back',
    '← Back',
    '← Back',
    undefined,
  ]);
  const setup = await runInteractiveSetup(fakePi(createEventBus()), makeCtx(dir, ui));
  expect(setup).toBeNull();
  // Back before the final settings confirm — nothing was persisted.
  // (The scripted name input returns 'x'.)
  const presetFile = path.join(dir, '.agents/review-presets/x.json');
  expect(fs.existsSync(presetFile)).toBe(false);
});

test('preset flow: with no stored presets, only Create preset is offered', async () => {
  // Fresh directory — no presets exist yet.
  const freshDir = makeCwd();
  const presetMenuOptions: string[] = [];
  let call = 0;
  const ui = {
    select: async (_title: string, options: readonly string[]) => {
      call += 1;
      if (call === 1) return 'Preset';
      if (call === 2) {
        presetMenuOptions.push(...options);
        return undefined; // cancel at the preset menu
      }
      return undefined;
    },
    input: async () => 'x',
    custom: async <T>(_fn: unknown): Promise<T> => undefined as T,
    notify: () => {},
    confirm: async () => true,
  } as unknown as ExtensionContext['ui'];

  const setup = await runInteractiveSetup(fakePi(createEventBus()), makeCtx(freshDir, ui));
  expect(setup).toBeNull();
  expect(presetMenuOptions).toEqual(['Create preset', '← Back']);
});

test('preset flow: after create, Exit leaves the wizard', async () => {
  const { ui } = makeUi({
    selects: [
      'Preset',
      'Create preset',
      '✓ Done — choose settings',
      '✓ Done — create preset',
      'Exit', // post-create: leave the wizard
    ],
    customs: [],
    inputs: ['exit-preset'],
  });

  const setup = await runInteractiveSetup(fakePi(createEventBus()), makeCtx(dir, ui));
  expect(setup).toBeNull();
  // The preset was saved before the exit prompt.
  const presetFile = path.join(dir, '.agents/review-presets/exit-preset.json');
  expect(fs.existsSync(presetFile)).toBe(true);
});

// ─── Preset list view ────────────────────────────────────────────────

/**
 * Scripted UI that tolerates explicit `undefined` in all queues (select
 * cancel, custom dialog dismissal, etc.).
 */
const scriptedUi = (
  selects: ReadonlyArray<string | undefined>,
  customs: ReadonlyArray<unknown>,
  inputs: ReadonlyArray<string | undefined> = [],
) => {
  const selectQueue = [...selects];
  const customQueue = [...customs];
  const inputQueue = [...inputs];
  return {
    ui: {
      select: async (_title: string, options: readonly string[]) => {
        const next = selectQueue.shift();
        if (next === undefined) return undefined;
        if (!options.includes(next)) {
          throw new Error(`scripted pick '${next}' not offered: ${options.join(' | ')}`);
        }
        return next;
      },
      custom: async <T>(_fn: unknown): Promise<T> => customQueue.shift() as T,
      input: async (_title: string, _prefill?: string) => {
        const next = inputQueue.shift();
        if (next === undefined) throw new Error('scripted input called too many times');
        return next;
      },
      notify: () => {},
      confirm: async () => true,
    } as unknown as ExtensionContext['ui'],
  };
};

test('renderPresetGraphic: draws a boxed summary of the preset', () => {
  const graphic = renderPresetGraphic({
    version: 1,
    name: 'demo',
    config: {
      reviewers: [
        { type: 'builtin', id: 'generic' },
        { type: 'profile', name: 'auditor', model: 'm' },
      ],
      supervisor: { model: 'deepseek-v4-pro' },
      fixerModel: 'deepseek-v4-flash-free',
      maxLoops: 5,
      deadlock: { flipThreshold: 2, action: 'escalate' },
    },
  });
  const lines = graphic.split('\n');
  expect(lines[0]?.startsWith('┌')).toBe(true);
  expect(lines[lines.length - 1]?.startsWith('└')).toBe(true);
  // Every body line is boxed and aligned to the same width.
  expect(lines.slice(1, -1).every((line) => line.startsWith('│') && line.endsWith('│'))).toBe(true);
  const widths = lines.map((line) => line.length);
  expect(new Set(widths).size).toBe(1);
  expect(graphic).toContain('demo');
  expect(graphic).toContain('generic');
  expect(graphic).toContain('auditor');
  expect(graphic).toContain('max loops');
  expect(graphic).toContain('flip 2');
});

test('preset flow: list → view → modify re-renders the graphic and saves back', async () => {
  const { ui } = scriptedUi(
    [
      'Preset',
      'List presets',
      'Modify preset', // detail action menu
      '✓ Done — choose settings', // roster (seeded from the preset)
      '✓ Done — update preset', // settings
      '← Back', // detail action menu after re-render
      undefined, // preset submenu → cancel
    ],
    // preset pick, first graphic dismiss, re-rendered graphic dismiss
    ['view-me', undefined, undefined],
    [],
  );

  // Seed the preset the list will view.
  const presetFile = path.join(dir, '.agents/review-presets/view-me.json');
  fs.mkdirSync(path.dirname(presetFile), { recursive: true });
  fs.writeFileSync(
    presetFile,
    JSON.stringify({
      version: 1,
      name: 'view-me',
      config: {
        reviewers: [{ type: 'builtin', id: 'generic' }],
        supervisor: { model: 'deepseek-v4-pro' },
        fixerModel: 'deepseek-v4-flash-free',
        maxLoops: 5,
        deadlock: { flipThreshold: 2, action: 'escalate' },
      },
    }),
  );

  const setup = await runInteractiveSetup(fakePi(createEventBus()), makeCtx(dir, ui));
  expect(setup).toBeNull();

  // Modify re-saved the preset — still valid and ref-based.
  const stored = JSON.parse(fs.readFileSync(presetFile, 'utf8')) as {
    config: { reviewers: unknown[] };
  };
  expect(stored.config.reviewers).toEqual([{ type: 'builtin', id: 'generic' }]);
});

test('preset flow: list → delete removes the preset from the view', async () => {
  const { ui } = scriptedUi(
    [
      'Preset',
      'List presets',
      'Delete preset', // detail action menu
      undefined, // preset submenu → cancel
    ],
    ['delete-me'], // preset pick + graphic dismiss (delete path shows graphic once)
    [],
  );

  const presetFile = path.join(dir, '.agents/review-presets/delete-me.json');
  fs.mkdirSync(path.dirname(presetFile), { recursive: true });
  fs.writeFileSync(
    presetFile,
    JSON.stringify({
      version: 1,
      name: 'delete-me',
      config: {
        reviewers: [{ type: 'builtin', id: 'generic' }],
        supervisor: { model: 'm' },
        fixerModel: 'f',
        maxLoops: 3,
        deadlock: { flipThreshold: 2, action: 'escalate' },
      },
    }),
  );

  const setup = await runInteractiveSetup(fakePi(createEventBus()), makeCtx(dir, ui));
  expect(setup).toBeNull();
  expect(fs.existsSync(presetFile)).toBe(false);
});
