import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Skill } from '@montflow/skills';
import { Effect, FileSystem, Layer, Path } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Doctor from '../index.js';
import { EMBEDDED_SKILL_PAYLOAD } from '../embedded-payload.generated.js';
import { realLive } from '../../cli/tests/fixtures.js';

/**
 * The embedded payload exists so a `--compile`d binary can install and verify
 * skills when the package directory does not exist. Staleness is the dangerous
 * failure: a silently outdated embed would teach an agent rules the verifier no
 * longer enforces. These tests hold the embed to the files on disk, and hold
 * both skills to the same standard verifier `mf-skills` exposes.
 */

const SKILLS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'skills',
);

const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/** Read a skill's real files off disk. Inferred: a name→contents map is an open dictionary. */
const readFromDisk = (name: string) => {
  const dir = join(SKILLS_DIR, name);
  const files: Record<string, string> = {};
  for (const entry of readdirSync(dir)
    .filter((file) => !file.startsWith('.'))
    .toSorted()) {
    files[entry] = readFileSync(join(dir, entry), 'utf8');
  }
  return files;
};

/** A throwaway root whose `skills/` does not exist — what a bundle looks like. */
const bareRoot = () => {
  const root = mkdtempSync(join(tmpdir(), 'mf-references-bundle-'));
  return { root, skills: join(root, 'skills') };
};

const drop = (dir: string): void => rmSync(dir, { recursive: true, force: true });

const field = (markdown: string, name: string): string | undefined =>
  new RegExp(`^${name}: (\\S+)$`, 'mu').exec(markdown)?.[1];

Vitest.describe('embedded reference skill payload', () => {
  Vitest.it('embeds exactly the skills doctor installs', () => {
    Vitest.expect(Object.keys(EMBEDDED_SKILL_PAYLOAD).toSorted()).toStrictEqual(
      [...Doctor.SKILL_NAMES].toSorted(),
    );
  });

  Vitest.it.each(Doctor.SKILL_NAMES)('%s: the embed matches skills/ byte for byte', (name) => {
    Vitest.expect(EMBEDDED_SKILL_PAYLOAD[name]).toStrictEqual(readFromDisk(name));
  });

  Vitest.it.each(Doctor.SKILL_NAMES)('%s: the embed carries a SKILL.md', (name) => {
    Vitest.expect(EMBEDDED_SKILL_PAYLOAD[name]?.['SKILL.md']).toBeDefined();
  });

  Vitest.it.each(Doctor.SKILL_NAMES)('%s: passes the full montflow standard verifier', (name) => {
    const result = Skill.verifyStandardSkillFile(name, readFromDisk(name)['SKILL.md'] ?? '');
    Vitest.expect(result).toStrictEqual({ valid: true, issues: [] });
  });

  Vitest.it.each(Doctor.SKILL_NAMES)(
    '%s: frontmatter version is the newest changelog entry',
    (name) => {
      const files = readFromDisk(name);
      const version = field(files['SKILL.md'] ?? '', 'version');
      Vitest.expect(version).toBeDefined();
      const newest = /^## \[(\S+)\]/mu.exec(files['CHANGELOG.md'] ?? '')?.[1];
      Vitest.expect(version).toBe(newest);
    },
  );
});

Vitest.describe('packaged skill contract', () => {
  Vitest.it.each(Doctor.SKILL_NAMES)('%s: calls the CLI on both surfaces', (name) => {
    const skill = readFromDisk(name)['SKILL.md'] ?? '';
    Vitest.expect(skill).toContain('mf-references');
    Vitest.expect(skill).toContain('/mf-references');
  });

  Vitest.it.each(Doctor.SKILL_NAMES)('%s: carries no registry table', (name) => {
    const skill = readFromDisk(name)['SKILL.md'] ?? '';
    Vitest.expect(skill).not.toMatch(/^\s*\|/mu);
  });

  Vitest.it('the add skill documents that a registered reference routes to update', () => {
    const skill = readFromDisk('montflow-add-reference')['SKILL.md'] ?? '';
    Vitest.expect(skill).toContain('routed add -> update');
    Vitest.expect(skill).toContain('notice, not a completed add');
    Vitest.expect(skill).toContain('exit 0');
  });
});

Vitest.describe('Doctor.readPayload', () => {
  Vitest.it.effect('prefers the package directory when it is readable', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const name = Doctor.SKILL_NAMES[0];
      const resolved = yield* Doctor.readPayload(fs, path, name, SKILLS_DIR);
      Vitest.expect(resolved?.origin).toBe('package');
      Vitest.expect(resolved?.files).toStrictEqual(readFromDisk(name));
    }).pipe(Effect.provide(NodeLive)),
  );

  Vitest.it.effect('falls back to the embed when the package directory is absent', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { root, skills } = bareRoot();
      const name = Doctor.SKILL_NAMES[0];
      const resolved = yield* Doctor.readPayload(fs, path, name, skills);
      Vitest.expect(resolved?.origin).toBe('embedded');
      Vitest.expect(resolved?.files).toStrictEqual(EMBEDDED_SKILL_PAYLOAD[name]);
      drop(root);
    }).pipe(Effect.provide(NodeLive)),
  );

  Vitest.it.effect('returns undefined for a skill neither source knows', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { root, skills } = bareRoot();
      Vitest.expect(yield* Doctor.readPayload(fs, path, 'nope', skills)).toBeUndefined();
      drop(root);
    }).pipe(Effect.provide(NodeLive)),
  );
});

Vitest.describe('Doctor.verifyPackagedSkills', () => {
  Vitest.it.effect('fails on a committed tree missing one skill instead of using the embed', () =>
    Effect.gen(function* () {
      const { root, skills } = bareRoot();
      const [missing, present] = Doctor.SKILL_NAMES;
      mkdirSync(join(skills, present), { recursive: true });
      for (const [file, text] of Object.entries(EMBEDDED_SKILL_PAYLOAD[present] ?? {})) {
        writeFileSync(join(skills, present, file), text, 'utf8');
      }
      const reports = yield* Doctor.verifyPackagedSkills({ skillsDir: skills });
      const block = reports.find((entry) => entry.path.includes(missing));
      Vitest.expect(block?.valid).toBe(false);
      Vitest.expect(block?.issues.map((issue) => issue.message).join(' ')).toContain(
        'is missing from',
      );
      drop(root);
    }).pipe(Effect.provide(NodeLive)),
  );

  Vitest.it.effect('fails on a committed skill directory with no SKILL.md', () =>
    Effect.gen(function* () {
      const { root, skills } = bareRoot();
      const [empty] = Doctor.SKILL_NAMES;
      mkdirSync(join(skills, empty), { recursive: true });
      const reports = yield* Doctor.verifyPackagedSkills({ skillsDir: skills });
      const block = reports.find((entry) => entry.path.includes(empty));
      Vitest.expect(block?.valid).toBe(false);
      Vitest.expect(block?.issues.map((issue) => issue.message).join(' ')).toContain(
        'has no SKILL.md',
      );
      drop(root);
    }).pipe(Effect.provide(NodeLive)),
  );

  Vitest.it.effect('names a subdirectory entry instead of blaming SKILL.md', () =>
    Effect.gen(function* () {
      const { root, skills } = bareRoot();
      const [name] = Doctor.SKILL_NAMES;
      mkdirSync(join(skills, name, 'references'), { recursive: true });
      writeFileSync(join(skills, name, 'SKILL.md'), '---\nname: X\n---\n', 'utf8');
      const reports = yield* Doctor.verifyPackagedSkills({ skillsDir: skills });
      const block = reports.find((entry) => entry.path.includes(name));
      const messages = block?.issues.map((issue) => issue.message).join(' ') ?? '';
      Vitest.expect(messages).toContain(`contains 'references', which is not a regular file`);
      Vitest.expect(messages).not.toContain('has no SKILL.md');
      drop(root);
    }).pipe(Effect.provide(NodeLive)),
  );

  Vitest.it.effect('reports an unreadable skill directory instead of a missing SKILL.md', () =>
    Effect.gen(function* () {
      if (process.platform === 'win32' || process.getuid?.() === 0) return;
      const { root, skills } = bareRoot();
      const [name] = Doctor.SKILL_NAMES;
      const dir = join(skills, name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'SKILL.md'), '---\nname: X\n---\n', 'utf8');
      chmodSync(dir, 0o000);
      const reports = yield* Doctor.verifyPackagedSkills({ skillsDir: skills });
      chmodSync(dir, 0o755);
      const block = reports.find((entry) => entry.path.includes(name));
      Vitest.expect(block?.issues.map((issue) => issue.message).join(' ')).toContain(
        'cannot be read',
      );
      drop(root);
    }).pipe(Effect.provide(NodeLive)),
  );

  Vitest.it.effect('reports a non-directory skill path instead of an unreadable directory', () =>
    Effect.gen(function* () {
      const { root, skills } = bareRoot();
      const [name] = Doctor.SKILL_NAMES;
      mkdirSync(skills, { recursive: true });
      writeFileSync(join(skills, name), 'not a directory\n', 'utf8');
      const reports = yield* Doctor.verifyPackagedSkills({ skillsDir: skills });
      const block = reports.find((entry) => entry.path.includes(name));
      Vitest.expect(block?.issues.map((issue) => issue.message).join(' ')).toContain(
        'is not a directory',
      );
      drop(root);
    }).pipe(Effect.provide(NodeLive)),
  );

  Vitest.it.effect('reports an unreadable file inside a skill', () =>
    Effect.gen(function* () {
      if (process.platform === 'win32' || process.getuid?.() === 0) return;
      const { root, skills } = bareRoot();
      const [name] = Doctor.SKILL_NAMES;
      const dir = join(skills, name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'SKILL.md'), '---\nname: X\n---\n', 'utf8');
      writeFileSync(join(dir, 'CHANGELOG.md'), '# changelog\n', 'utf8');
      chmodSync(join(dir, 'CHANGELOG.md'), 0o000);
      const reports = yield* Doctor.verifyPackagedSkills({ skillsDir: skills });
      chmodSync(join(dir, 'CHANGELOG.md'), 0o644);
      const block = reports.find((entry) => entry.path.includes(name));
      Vitest.expect(block?.issues.map((issue) => issue.message).join(' ')).toContain(
        "has an unreadable 'CHANGELOG.md'",
      );
      drop(root);
    }).pipe(Effect.provide(NodeLive)),
  );
});

Vitest.describe('a skills tree installed from the embed', () => {
  Vitest.it.effect('reports as current because it is byte-identical to the embed', () =>
    Effect.gen(function* () {
      const { root } = bareRoot();
      for (const name of Doctor.SKILL_NAMES) {
        const dir = join(root, '.agents', 'skills', name);
        mkdirSync(dir, { recursive: true });
        for (const [file, text] of Object.entries(EMBEDDED_SKILL_PAYLOAD[name] ?? {})) {
          writeFileSync(join(dir, file), text, 'utf8');
        }
      }
      const checked = yield* Doctor.runDoctor(root, { check: true });
      const skills = checked.checks.filter(
        (entry) => entry.name === 'skills-installed' || entry.name === 'skills-current',
      );
      Vitest.expect(skills.map((entry) => entry.status)).toStrictEqual(['ok', 'ok']);
      drop(root);
    }).pipe(Effect.provide(realLive)),
  );
});
