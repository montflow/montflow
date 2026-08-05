import { Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import { parseFrontmatter } from './model.ts';

/** A skill discovered under `.agents/skills/`. */
export interface SkillInfo {
  /** Canonical skill name (SKILL.md frontmatter `name:`), falls back to dir name. */
  readonly name: string;
  /** One-line description from SKILL.md frontmatter. */
  readonly description: string;
  /** Directory name under `.agents/skills/`. */
  readonly dir: string;
}

/** Lists skills under `.agents/skills/`, reading each SKILL.md frontmatter. */
export const listSkills = (cwd: string): Effect.Effect<SkillInfo[], never, FileSystem | Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const path = yield* Path;
    const root = path.join(cwd, '.agents', 'skills');

    const exists = yield* fileSystem.exists(root).pipe(Effect.orElseSucceed(() => false));
    if (!exists) return [];

    const entries = yield* fileSystem.readDirectory(root).pipe(Effect.orElseSucceed(() => []));

    const skills: SkillInfo[] = [];
    for (const entry of entries) {
      const skillFile = path.join(root, entry, 'SKILL.md');
      const hasFile = yield* fileSystem.exists(skillFile).pipe(Effect.orElseSucceed(() => false));
      if (!hasFile) continue;

      const content = yield* fileSystem.readFileString(skillFile, 'utf8').pipe(Effect.orElseSucceed(() => ''));
      const fm = parseFrontmatter(content);
      const name = typeof fm?.fields['name'] === 'string' && fm.fields['name'].trim() !== ''
        ? fm.fields['name'].trim()
        : entry;
      const description = typeof fm?.fields['description'] === 'string'
        ? fm.fields['description'].trim()
        : '';

      skills.push({ name, description, dir: entry });
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name));
  });

/** Returns the set of known skill names, for validating profile skill lists. */
export const knownSkillNames = (cwd: string): Effect.Effect<Set<string>, never, FileSystem | Path> =>
  listSkills(cwd).pipe(Effect.map((skills) => new Set(skills.map((skill) => skill.name))));
