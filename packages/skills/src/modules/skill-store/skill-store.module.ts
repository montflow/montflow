// eslint-disable-next-line montflow/no-node-platform-imports -- file store reads/writes .agents/skills via node fs; migrate to FileSystem when pi-skills moves onto the platform layer graph.
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: path joins for skill files.
import { join } from 'node:path';
import { Effect } from 'effect';
import * as Skill from '../skill/index.js';

/**
 * Absolute skills directory for a workspace root:
 * `<root>/.agents/skills`.
 * @param root - workspace root
 * @returns absolute skills directory
 */
export const skillsDir = (root: string): string => join(root, '.agents', 'skills');

/** Absolute `SKILL.md` path for one skill directory. */
const skillFile = (root: string, id: string): string => join(skillsDir(root), id, 'SKILL.md');

/** True when a path exists, never failing. */
const pathExists = (target: string): Promise<boolean> =>
  stat(target).then(
    () => true,
    () => false,
  );

/** Reason text for a caught value. */
const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/**
 * Directory names directly under the skills root. A missing directory
 * reads as empty, so listing never fails.
 * @param root - workspace root (skill store owner)
 * @returns Effect resolving to the sorted directory names
 */
export const names = (root: string): Effect.Effect<ReadonlyArray<string>, never> =>
  Effect.promise(() =>
    readdir(skillsDir(root)).then(
      (entries) => entries.toSorted(),
      // A missing directory lists as empty, never fails.
      () => [],
    ),
  );

/**
 * List stored skills for a workspace root, sorted by name. A missing
 * directory reads as empty and malformed files skip, so the list never
 * fails.
 * @param root - workspace root (skill store owner)
 * @returns Effect resolving to the stored skills
 */
export const list = (root: string): Effect.Effect<ReadonlyArray<Skill.Skill>, never> =>
  Effect.gen(function* () {
    const entries = yield* names(root);
    const skills = yield* Effect.forEach(entries, (entry) =>
      Effect.promise(() =>
        readFile(skillFile(root, entry), 'utf8').then(
          (raw) => raw,
          () => undefined,
        ),
      ).pipe(
        Effect.flatMap((raw) =>
          raw === undefined
            ? Effect.succeed(undefined)
            : Skill.decodeSkillFile(entry, raw).pipe(Effect.orElseSucceed(() => undefined)),
        ),
      ),
    );
    return skills
      .filter((skill): skill is Skill.Skill => skill !== undefined)
      .toSorted((a, b) => a.name.localeCompare(b.name));
  });

/**
 * Read one skill's raw `SKILL.md` file. The id is slug-validated so it
 * can never escape `.agents/skills/`.
 * @param root - workspace root (skill store owner)
 * @param id - skill directory slug
 * @returns Effect resolving to the raw file contents, failing on unknown ids
 */
export const readRaw = (root: string, id: string): Effect.Effect<string, string> => {
  if (!Skill.isValidName(id)) return Effect.fail(`Unknown skill '${id}'.`);
  return Effect.tryPromise({
    try: () => readFile(skillFile(root, id), 'utf8'),
    catch: () => `Unknown skill '${id}'.`,
  });
};

/**
 * Write a skill's `SKILL.md` file, creating the directory as needed.
 * @param root - workspace root (skill store owner)
 * @param skill - skill to persist
 * @returns Effect completing once written, failing on write errors
 */
export const save = (root: string, skill: Skill.Skill): Effect.Effect<void, string> => {
  const dir = join(skillsDir(root), skill.id);
  return Effect.tryPromise({
    try: () =>
      mkdir(dir, { recursive: true }).then(() =>
        writeFile(join(dir, 'SKILL.md'), Skill.encodeSkillFile(skill), 'utf8'),
      ),
    catch: (cause) => `Failed to write ${join(dir, 'SKILL.md')}: ${reasonOf(cause)}`,
  });
};

/**
 * Delete a skill's directory. The id is slug-validated so it can never
 * escape `.agents/skills/` (no path traversal). Fails on unknown ids.
 * @param root - workspace root (skill store owner)
 * @param id - skill directory slug
 * @returns Effect completing once removed, failing on unknown ids or write errors
 */
export const remove = (root: string, id: string): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    if (!Skill.isValidName(id)) return yield* Effect.fail(`Unknown skill '${id}'.`);
    const dir = join(skillsDir(root), id);
    if (!(yield* Effect.promise(() => pathExists(join(dir, 'SKILL.md'))))) {
      return yield* Effect.fail(`Unknown skill '${id}'.`);
    }
    yield* Effect.tryPromise({
      try: () => rm(dir, { recursive: true }),
      catch: (cause) => `Failed to delete ${dir}: ${reasonOf(cause)}`,
    });
  });
