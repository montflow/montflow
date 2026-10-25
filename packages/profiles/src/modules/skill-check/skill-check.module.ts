import { Effect } from 'effect';
// eslint-disable-next-line montflow/no-node-platform-imports -- the skills store is a platform boundary; the skills store owns its files, this only asks whether it exists.
import { stat } from 'node:fs/promises';
import * as PiProfiles from '../pi-profiles/index.js';

/**
 * Check the skills a profile declares by delegating to the skills
 * `verify` engine — the same engine the `mf-skills` CLI runs, so a
 * profile and the skills CLI can never disagree. Montflow skills
 * (`montflow-*`) are held to the full standard; generic and vendored
 * skills only have to exist.
 *
 * `@montflow/skills` is imported lazily: verifying profiles must not
 * pull the whole skills extension into every session. When it cannot be
 * loaded, the check is skipped and the caller surfaces a warning rather
 * than failing the profile.
 */

/** The skills extension runtime, resolved lazily. */
type PiSkillsLib = typeof import('@montflow/skills');

/** Warning surfaced when the skills engine cannot be loaded. */
export const SKILLS_ENGINE_WARNING = 'Skill verification skipped: could not load @montflow/skills.';

let cached: Promise<PiSkillsLib> | undefined;

/** Single lazy import: a failure clears the cache so the next check retries. */
const importOnce = (): Promise<PiSkillsLib> => {
  cached ??= import('@montflow/skills').catch((cause: unknown) => {
    cached = undefined;
    throw cause;
  });
  return cached;
};

/** The skills runtime, or undefined when it is unavailable — never fails. */
const load = (): Effect.Effect<PiSkillsLib | undefined> =>
  Effect.tryPromise(() => importOnce()).pipe(Effect.orElseSucceed(() => undefined));

/**
 * Whether the skills runtime can be loaded. {@link resolveSkills} returns
 * undefined both when no skills store exists and when the engine is
 * unavailable; this lets a caller tell the two apart, so only the skipped
 * check the reader asked for is surfaced as a warning.
 * @returns Effect resolving to true when the engine loaded
 */
export const engineAvailable = (): Effect.Effect<boolean> =>
  load().pipe(Effect.map((libs) => libs !== undefined));

/** True when `target` exists, never failing. */
const pathExists = (target: string): Promise<boolean> =>
  stat(target).then(
    () => true,
    () => false,
  );

/**
 * Resolve the skills installed under `<cwd>/.agents/skills`, so a pure
 * verifier can resolve `skills:` names without owning any IO. Returns
 * undefined when the store does not exist (a package fixture or fresh clone)
 * or the skills runtime is unavailable, so the caller emits no finding
 * rather than a false "not installed".
 * @param cwd - workspace root owning `.agents/skills`
 * @returns the resolution, or undefined when it cannot be resolved
 */
export const resolveSkills = (cwd: string): Effect.Effect<PiProfiles.SkillResolution | undefined> =>
  Effect.gen(function* () {
    const libs = yield* load();
    if (libs === undefined) return undefined;
    const dir = libs.SkillStore.skillsDir(cwd);
    if (!(yield* Effect.promise(() => pathExists(dir)))) return undefined;
    return { root: cwd, names: new Set(yield* libs.SkillStore.names(cwd)) };
  });

/** One declared skill's verify outcome. `issue` is undefined when it passes. */
export interface SkillVerdict {
  readonly name: string;
  readonly issue: PiProfiles.VerifyIssue | undefined;
}

/** Outcome of checking a profile's declared skills. */
export interface SkillCheck {
  readonly verdicts: ReadonlyArray<SkillVerdict>;
}

/** One-line rendering of a skill's verify issues. */
const summarize = (
  issues: ReadonlyArray<{ readonly field: string; readonly message: string }>,
): string => issues.map((found) => `[${found.field}] ${found.message}`).join('; ');

/**
 * Verify one declared skill. An unknown name (no `SKILL.md`) reads as a
 * missing-skill issue; a montflow skill that fails the standard carries
 * its issues.
 * @param libs - loaded skills runtime
 * @param cwd - workspace root owning `.agents/skills`
 * @param name - declared skill name
 * @returns Effect resolving to the verdict, never failing
 */
const checkOne = (libs: PiSkillsLib, cwd: string, name: string): Effect.Effect<SkillVerdict> =>
  libs.Cli.Engines.verify({ cwd }, name).pipe(
    Effect.map((report): SkillVerdict => {
      const entry = report.entries[0];
      if (entry === undefined || entry.result.valid) return { name, issue: undefined };
      return {
        name,
        issue: {
          field: 'skills',
          message: `Skill '${name}' failed verification: ${summarize(entry.result.issues)}`,
        },
      };
    }),
    Effect.orElseSucceed((): SkillVerdict => ({
      name,
      issue: {
        field: 'skills',
        message: `Skill '${name}' is not installed under .agents/skills/.`,
      },
    })),
  );

/**
 * Verify the declared skills of one or more profiles. Deduplicates names
 * and verifies each once. Empty input short-circuits without loading the
 * skills engine. When a caller supplies names but the engine cannot load,
 * no verdicts are produced: the caller resolved the store first and owns the
 * "check skipped" warning, so this module never has to invent one.
 * @param cwd - workspace root owning `.agents/skills`
 * @param names - declared skill names, across every profile being checked
 * @returns Effect resolving to the verdicts
 */
export const checkSkills = (cwd: string, names: ReadonlyArray<string>): Effect.Effect<SkillCheck> =>
  Effect.gen(function* () {
    const unique = [...new Set(names)];
    if (unique.length === 0) return { verdicts: [] };
    const libs = yield* load();
    if (libs === undefined) return { verdicts: [] };
    const verdicts = yield* Effect.forEach(unique, (name) => checkOne(libs, cwd, name));
    return { verdicts };
  });
