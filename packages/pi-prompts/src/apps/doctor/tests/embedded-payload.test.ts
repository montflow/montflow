import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Path } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Doctor from '../index.js';
import { EMBEDDED_SKILL_PAYLOAD } from '../embedded-payload.generated.js';

/**
 * The embedded payload exists so a `--compile`d binary can install and verify
 * skills when the package directory does not exist. That makes staleness the
 * dangerous failure: a silently outdated embed would teach an agent rules the
 * verifier no longer enforces — precisely what the skills gate exists to
 * prevent. So these tests hold the embed to the files on disk, and prove the
 * fallback works rather than merely existing.
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
  const root = mkdtempSync(join(tmpdir(), 'mf-bundle-'));
  return { root, skills: join(root, 'skills') };
};

const drop = (dir: string): void => rmSync(dir, { recursive: true, force: true });

Vitest.describe('embedded skill payload', () => {
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
      Vitest.expect(resolved?.source).toBe('embedded in this build');
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

Vitest.describe('a skills tree installed from the embed', () => {
  Vitest.it.effect('verifies as current, because it is byte-identical to the embed', () =>
    Effect.gen(function* () {
      const { root } = bareRoot();
      for (const name of Doctor.SKILL_NAMES) {
        const dir = join(root, '.agents', 'skills', name);
        mkdirSync(dir, { recursive: true });
        for (const [file, text] of Object.entries(EMBEDDED_SKILL_PAYLOAD[name] ?? {})) {
          writeFileSync(join(dir, file), text, 'utf8');
        }
      }
      const check = yield* Doctor.runDoctor(root, { check: true });
      Vitest.expect(check.healthy).toBe(true);
      Vitest.expect(check.skills.map((skill) => skill.status)).toStrictEqual(
        Doctor.SKILL_NAMES.map(() => 'ok'),
      );
      drop(root);
    }).pipe(Effect.provide(NodeLive)),
  );

  Vitest.it.effect('is repaired when a file is edited', () =>
    Effect.gen(function* () {
      const { root } = bareRoot();
      const name = Doctor.SKILL_NAMES[0];
      const dir = join(root, '.agents', 'skills', name);
      mkdirSync(dir, { recursive: true });
      for (const [file, text] of Object.entries(EMBEDDED_SKILL_PAYLOAD[name] ?? {})) {
        writeFileSync(join(dir, file), text, 'utf8');
      }
      writeFileSync(join(dir, 'SKILL.md'), 'edited by hand\n', 'utf8');

      const check = yield* Doctor.runDoctor(root, { check: true });
      Vitest.expect(check.healthy).toBe(false);
      const repaired = yield* Doctor.runDoctor(root);
      Vitest.expect(repaired.healthy).toBe(true);
      Vitest.expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toBe(
        EMBEDDED_SKILL_PAYLOAD[name]?.['SKILL.md'],
      );
      drop(root);
    }).pipe(Effect.provide(NodeLive)),
  );
});
