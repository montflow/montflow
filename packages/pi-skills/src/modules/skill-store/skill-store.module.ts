// eslint-disable-next-line montflow/no-node-platform-imports -- file store reads .agents/skills via node fs; migrate to FileSystem when pi-skills moves onto the platform layer graph.
import { readdir, readFile } from 'node:fs/promises';
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

/**
 * Decode one `SKILL.md` file into a `Skill`. The directory name is the
 * id; frontmatter `name` falls back to it. Malformed files read as
 * undefined so the list skips them.
 * @param id - skill directory name
 * @param markdown - raw SKILL.md contents
 * @returns Effect resolving to the skill, or undefined when malformed
 */
const decodeFile = (id: string, markdown: string): Effect.Effect<Skill.Skill | undefined> => {
  const parsed = Skill.parseSkillFile(markdown);
  if (parsed === null) return Effect.succeed(undefined);
  const rawName = Skill.fieldString(parsed.fields, 'name');
  return Skill.decodeUnknown({
    id,
    name: rawName === undefined || rawName === '' ? id : rawName,
    description: Skill.fieldString(parsed.fields, 'description') ?? '',
    groups: [...Skill.fieldStrings(parsed.fields, 'groups')],
    dependencies: [...Skill.fieldStrings(parsed.fields, 'dependencies')],
    body: parsed.body,
  }).pipe(Effect.orElseSucceed(() => undefined));
};

/**
 * List stored skills for a workspace root, sorted by name. Async file
 * reads behind an Effect: a missing directory reads as empty and
 * malformed files skip, so the list never fails.
 * @param root - workspace root (skill store owner)
 * @returns Effect resolving to the stored skills
 */
export const list = (root: string): Effect.Effect<ReadonlyArray<Skill.Skill>, never> =>
  Effect.gen(function* () {
    const dir = skillsDir(root);
    const entries = yield* Effect.promise(() =>
      readdir(dir).then(
        (names) => ({ ok: true as const, names }),
        // SAFETY: the rejection branch carries no names, so the empty array type is exact.
        () => ({ ok: false as const, names: [] as Array<string> }),
      ),
    );
    if (!entries.ok) return [];
    const skills = yield* Effect.forEach(entries.names, (entry) =>
      Effect.promise(() =>
        readFile(join(dir, entry, 'SKILL.md'), 'utf8').then(
          (raw) => raw,
          () => undefined,
        ),
      ).pipe(
        Effect.flatMap((raw) =>
          raw === undefined ? Effect.succeed(undefined) : decodeFile(entry, raw),
        ),
      ),
    );
    return skills
      .filter((skill): skill is Skill.Skill => skill !== undefined)
      .toSorted((a, b) => a.name.localeCompare(b.name));
  });
