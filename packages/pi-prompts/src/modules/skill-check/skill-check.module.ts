import { Effect } from 'effect';
// eslint-disable-next-line montflow/no-node-platform-imports -- the skills store lives under `.agents/skills`; this module is its platform boundary.
import { readdir } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- path join for the skills store directory.
import { join } from 'node:path';
import * as Prompts from '../prompts/index.js';

/**
 * Resolve the skills installed under `<root>/.agents/skills`, so a pure prompt
 * verifier can resolve `skills:` names without owning any IO. Mirrors
 * `@montflow/pi-profiles`' skill check for the shape of the resolution, but
 * only checks existence: a prompt's `skills:` list names what a run loads, and
 * this package has no skills engine to hold those skills to a standard.
 *
 * Returns undefined when the store does not exist (a package fixture or a
 * fresh clone), so the caller emits no finding rather than a false
 * "not installed" for every declared name.
 * @param root - workspace root owning `.agents/skills`
 * @returns Effect resolving to the resolution, or undefined when there is none
 */
export const resolveSkills = (root: string): Effect.Effect<Prompts.SkillResolution | undefined> =>
  Effect.tryPromise({
    try: async (): Promise<Prompts.SkillResolution> => {
      const entries = await readdir(join(root, '.agents', 'skills'), { withFileTypes: true });
      const names = new Set(
        entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
      );
      return { root, names };
    },
    catch: () => 'no skills store',
  }).pipe(Effect.orElseSucceed(() => undefined));
