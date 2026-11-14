import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import {
  type EmbeddedPayload,
  type PayloadManifest,
  loadManifest,
  runPayloadDoctor,
} from '../../index.js';

/**
 * The engine's contract: every kind installs from one manifest, `check` never
 * writes, and one blocked payload never aborts the rest of the run.
 */

const EMPTY: EmbeddedPayload = { skill: {}, profile: {}, prompt: {}, tier: {} };

const MANIFEST: PayloadManifest = {
  schema: 1,
  package: '@fixture/payload',
  payloads: [
    {
      kind: 'skill',
      name: 'demo-skill',
      source: 'skills/demo-skill',
      target: '.agents/skills/demo-skill',
    },
    {
      kind: 'profile',
      name: 'demo-profile',
      source: 'profiles/demo-profile',
      target: '.agents/@montflow/profiles/demo-profile',
    },
    {
      kind: 'prompt',
      name: 'demo-prompt',
      source: 'prompts/demo-prompt.json',
      target: '.agents/@montflow/prompts/demo-prompt.json',
    },
    {
      kind: 'tier',
      name: 'micro',
      source: 'tiers/micro.md',
      target: '.agents/@montflow/tiers/micro.md',
    },
  ],
};

const SKILL_FILES = { 'SKILL.md': '# demo skill\n', 'CHANGELOG.md': '# changelog\n' };
const PROFILE_FILES = { 'PROFILE.md': '# demo profile\n' };
const PROMPT_TEXT = '{"name":"demo-prompt"}\n';
const TIER_TEXT = '# micro\n';

/** Write a package tree that the manifest points at. */
const makePackage = (root: string): string => {
  const pkg = NodePath.join(root, 'package');
  Fs.mkdirSync(NodePath.join(pkg, 'skills', 'demo-skill'), { recursive: true });
  for (const [file, text] of Object.entries(SKILL_FILES)) {
    Fs.writeFileSync(NodePath.join(pkg, 'skills', 'demo-skill', file), text);
  }
  Fs.mkdirSync(NodePath.join(pkg, 'profiles', 'demo-profile'), { recursive: true });
  for (const [file, text] of Object.entries(PROFILE_FILES)) {
    Fs.writeFileSync(NodePath.join(pkg, 'profiles', 'demo-profile', file), text);
  }
  Fs.mkdirSync(NodePath.join(pkg, 'prompts'), { recursive: true });
  Fs.writeFileSync(NodePath.join(pkg, 'prompts', 'demo-prompt.json'), PROMPT_TEXT);
  Fs.mkdirSync(NodePath.join(pkg, 'tiers'), { recursive: true });
  Fs.writeFileSync(NodePath.join(pkg, 'tiers', 'micro.md'), TIER_TEXT);
  return pkg;
};

/** A workspace root and package root pair. */
const fixture = () => {
  const root = Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-payload-doctor-'));
  return { root, pkg: makePackage(root) };
};

const cleanup = (root: string): void => Fs.rmSync(root, { recursive: true, force: true });

const run = (root: string, pkg: string, check = false, embedded: EmbeddedPayload = EMPTY) =>
  runPayloadDoctor(
    root,
    { ok: true, manifest: MANIFEST },
    {
      check,
      packageRoot: pkg,
      embedded,
      invocation: 'mf-fixture doctor',
      subject: 'fixtures',
    },
  ).pipe(Effect.runPromise);

/** Every path under a root, relative, with bytes, for a no-write comparison. */
const snapshot = (root: string): ReadonlyArray<string> => {
  if (!Fs.existsSync(root)) return [];
  const out: Array<string> = [];
  const walk = (dir: string): void => {
    for (const entry of Fs.readdirSync(dir, { withFileTypes: true }).toSorted((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = NodePath.join(dir, entry.name);
      const relative = NodePath.relative(root, full);
      if (entry.isSymbolicLink()) {
        out.push(`${relative} -> ${Fs.readlinkSync(full)}`);
      } else if (entry.isDirectory()) {
        out.push(`${relative}/`);
        walk(full);
      } else {
        out.push(`${relative}:${Fs.readFileSync(full, 'utf8')}`);
      }
    }
  };
  walk(root);
  return out;
};

const installed = (root: string, target: string): string => NodePath.join(root, target);

Vitest.describe('runPayloadDoctor', () => {
  Vitest.it('check reports every kind missing and writes nothing at all', async () => {
    const { root, pkg } = fixture();
    const before = snapshot(root);
    const result = await run(root, pkg, true);
    Vitest.expect(result.healthy).toBe(false);
    Vitest.expect(result.status).toBe('drifted');
    Vitest.expect(result.payloads.map((payload) => payload.status)).toStrictEqual([
      'missing',
      'missing',
      'missing',
      'missing',
    ]);
    Vitest.expect(Fs.existsSync(NodePath.join(root, '.agents'))).toBe(false);
    Vitest.expect(snapshot(root)).toStrictEqual(before);
    cleanup(root);
  });

  Vitest.it('repairs every kind from one command and then re-reports healthy', async () => {
    const { root, pkg } = fixture();
    const first = await run(root, pkg);
    Vitest.expect(first.healthy).toBe(true);
    Vitest.expect(first.status).toBe('installed');
    Vitest.expect(first.payloads.map((payload) => payload.status)).toStrictEqual([
      'installed',
      'installed',
      'installed',
      'installed',
    ]);
    Vitest.expect(
      Fs.readFileSync(installed(root, '.agents/@montflow/tiers/micro.md'), 'utf8'),
    ).toBe(TIER_TEXT);
    Vitest.expect(
      Fs.readFileSync(installed(root, '.agents/@montflow/prompts/demo-prompt.json'), 'utf8'),
    ).toBe(PROMPT_TEXT);
    Vitest.expect(
      Fs.readFileSync(
        installed(root, '.agents/@montflow/profiles/demo-profile/PROFILE.md'),
        'utf8',
      ),
    ).toBe(PROFILE_FILES['PROFILE.md']);

    const second = await run(root, pkg, true);
    Vitest.expect(second.healthy).toBe(true);
    Vitest.expect(second.status).toBe('ok');
    Vitest.expect(second.payloads.every((payload) => payload.status === 'ok')).toBe(true);
    cleanup(root);
  });

  Vitest.it('reports stale for changed bytes and repairs them', async () => {
    const { root, pkg } = fixture();
    await run(root, pkg);
    const skillFile = installed(root, '.agents/skills/demo-skill/SKILL.md');
    const promptFile = installed(root, '.agents/@montflow/prompts/demo-prompt.json');
    Fs.writeFileSync(skillFile, '# hand edited\n');
    Fs.writeFileSync(promptFile, '{"stale":true}\n');

    const checked = await run(root, pkg, true);
    Vitest.expect(checked.healthy).toBe(false);
    Vitest.expect(checked.payloads[0]?.status).toBe('stale');
    Vitest.expect(checked.payloads[2]?.status).toBe('stale');
    Vitest.expect(Fs.readFileSync(skillFile, 'utf8')).toBe('# hand edited\n');
    Vitest.expect(Fs.readFileSync(promptFile, 'utf8')).toBe('{"stale":true}\n');

    const repaired = await run(root, pkg);
    Vitest.expect(repaired.healthy).toBe(true);
    Vitest.expect(repaired.payloads[0]?.status).toBe('repaired');
    Vitest.expect(repaired.payloads[2]?.status).toBe('repaired');
    Vitest.expect(Fs.readFileSync(skillFile, 'utf8')).toBe(SKILL_FILES['SKILL.md']);
    Vitest.expect(Fs.readFileSync(promptFile, 'utf8')).toBe(PROMPT_TEXT);
    cleanup(root);
  });

  Vitest.it('reports mismatched for a partial install and restores the missing file', async () => {
    const { root, pkg } = fixture();
    await run(root, pkg);
    const changelog = installed(root, '.agents/skills/demo-skill/CHANGELOG.md');
    Fs.rmSync(changelog);

    const checked = await run(root, pkg, true);
    Vitest.expect(checked.payloads[0]?.status).toBe('mismatched');
    Vitest.expect(checked.payloads[0]?.detail).toContain('CHANGELOG.md');
    Vitest.expect(Fs.existsSync(changelog)).toBe(false);

    const repaired = await run(root, pkg);
    Vitest.expect(repaired.payloads[0]?.status).toBe('repaired');
    Vitest.expect(Fs.existsSync(changelog)).toBe(true);
    cleanup(root);
  });

  Vitest.it('keeps extra installed files as user data and stays healthy', async () => {
    const { root, pkg } = fixture();
    await run(root, pkg);
    const stray = installed(root, '.agents/skills/demo-skill/stray.md');
    Fs.writeFileSync(stray, 'mine\n');

    const checked = await run(root, pkg, true);
    Vitest.expect(checked.healthy).toBe(true);
    Vitest.expect(checked.payloads[0]?.status).toBe('ok');
    Vitest.expect(checked.payloads[0]?.extras).toStrictEqual(['stray.md']);

    const repaired = await run(root, pkg);
    Vitest.expect(repaired.payloads[0]?.status).toBe('present');
    Vitest.expect(Fs.readFileSync(stray, 'utf8')).toBe('mine\n');
    cleanup(root);
  });

  Vitest.it('blocks a symlinked tree in both modes and never writes through it', async () => {
    const { root, pkg } = fixture();
    await run(root, pkg);
    const target = installed(root, '.agents/skills/demo-skill');
    const outside = NodePath.join(root, 'outside-skill');
    Fs.mkdirSync(outside);
    Fs.writeFileSync(NodePath.join(outside, 'SKILL.md'), 'outside\n');
    Fs.rmSync(target, { recursive: true });
    Fs.symlinkSync(outside, target);

    const checked = await run(root, pkg, true);
    const blocked = checked.payloads[0];
    Vitest.expect(blocked?.status).toBe('blocked');
    Vitest.expect(blocked?.failure?.code).toBe('doctor.symlink');
    Vitest.expect(checked.message).not.toContain('Run: mf-fixture doctor');

    const repaired = await run(root, pkg);
    Vitest.expect(repaired.payloads[0]?.status).toBe('blocked');
    Vitest.expect(Fs.readFileSync(NodePath.join(outside, 'SKILL.md'), 'utf8')).toBe('outside\n');
    cleanup(root);
  });

  Vitest.it('reports a payload whose source and embed are both absent with its fix', async () => {
    const { root, pkg } = fixture();
    Fs.rmSync(NodePath.join(pkg, 'skills', 'demo-skill'), { recursive: true });

    const checked = await run(root, pkg, true);
    const blocked = checked.payloads[0];
    Vitest.expect(blocked?.status).toBe('blocked');
    Vitest.expect(blocked?.failure?.code).toBe('doctor.payload');
    Vitest.expect(checked.message).toContain("skill 'demo-skill'");
    Vitest.expect(checked.message).toContain('not embedded in this build');
    Vitest.expect(checked.message).toContain('Fix: Reinstall @fixture/payload');
    Vitest.expect(checked.message).toContain('mf-fixture doctor');
    // The other entries still ran.
    Vitest.expect(checked.payloads.slice(1).map((payload) => payload.status)).toStrictEqual([
      'missing',
      'missing',
      'missing',
    ]);
    cleanup(root);
  });

  Vitest.it('uses the embedded bytes when the package directory is absent', async () => {
    const { root } = fixture();
    const embedded: EmbeddedPayload = {
      ...EMPTY,
      skill: { 'demo-skill': SKILL_FILES },
    };
    const result = await run(root, 'does-not-exist', false, embedded);
    Vitest.expect(result.healthy).toBe(false);
    Vitest.expect(result.payloads[0]?.status).toBe('installed');
    Vitest.expect(result.payloads[0]?.source).toBe('embedded in this build');
    Vitest.expect(
      Fs.readFileSync(installed(root, '.agents/skills/demo-skill/SKILL.md'), 'utf8'),
    ).toBe(SKILL_FILES['SKILL.md']);
    // The entries with no embed and no source are blocked, not silently skipped.
    Vitest.expect(result.payloads.slice(1).map((payload) => payload.status)).toStrictEqual([
      'blocked',
      'blocked',
      'blocked',
    ]);
    cleanup(root);
  });

  Vitest.it('a broken manifest is a blocked run, never an empty success', async () => {
    const { root, pkg } = fixture();
    const loaded = loadManifest(
      { schema: 1, package: '@fixture/payload', payloads: [] },
      '@fixture/payload',
    );
    const result = await runPayloadDoctor(root, loaded, {
      check: true,
      packageRoot: pkg,
      embedded: EMPTY,
      invocation: 'mf-fixture doctor',
    }).pipe(Effect.runPromise);
    Vitest.expect(result.healthy).toBe(false);
    Vitest.expect(result.status).toBe('drifted');
    Vitest.expect(result.manifestFailure?.code).toBe('doctor.manifest-missing');
    Vitest.expect(result.message).toContain('payload manifest');
    Vitest.expect(Fs.existsSync(root)).toBe(true);
    cleanup(root);
  });

  Vitest.it('check leaves a broken tree byte-identical', async () => {
    const { root, pkg } = fixture();
    await run(root, pkg);
    Fs.writeFileSync(installed(root, '.agents/skills/demo-skill/SKILL.md'), 'stale\n');
    Fs.writeFileSync(installed(root, '.agents/@montflow/tiers/micro.md'), 'stale\n');
    Fs.writeFileSync(installed(root, '.agents/skills/demo-skill/extra.md'), 'extra\n');
    const before = snapshot(root);
    await run(root, pkg, true);
    Vitest.expect(snapshot(root)).toStrictEqual(before);
    cleanup(root);
  });
});
