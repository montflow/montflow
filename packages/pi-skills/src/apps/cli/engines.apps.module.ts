import { Effect } from 'effect';
import { Skill, SkillStore } from '../../modules/index.js';

/**
 * Shared engines for both pi-skills front ends: the `mf-skills` binary
 * and the `/mf-skills` slash command. Structured in, data out — engines
 * know nothing about argv or output, so the two surfaces cannot diverge.
 *
 * Every operation works on a plain skills directory; nothing here opens a
 * dialog, so an agent or script can drive it mechanically.
 */

/** Where an operation reads and writes: a working directory, an optional root override. */
export interface StoreScope {
  readonly cwd: string;
  /** Workspace root containing `.agents/skills`. Defaults to `cwd`. */
  readonly dir?: string | undefined;
}

/** Resolve the workspace root a scope names. */
const rootOf = (scope: StoreScope): string => scope.dir ?? scope.cwd;

/** Fields `create` accepts; every skill must have a name and description. */
export interface CreateInput {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  readonly author: string | undefined;
  readonly version: string | undefined;
  readonly license: string | undefined;
  readonly groups: ReadonlyArray<string>;
  readonly dependencies: ReadonlyArray<string>;
}

/** Fields `modify` may change; `undefined` keeps the stored value. */
export interface ModifyInput {
  readonly name: string;
  readonly description: string | undefined;
  readonly body: string | undefined;
  readonly author: string | undefined;
  readonly version: string | undefined;
  readonly license: string | undefined;
  readonly groups: ReadonlyArray<string> | undefined;
  readonly dependencies: ReadonlyArray<string> | undefined;
}

/**
 * List stored skills, sorted by name. A missing root reads as empty and
 * malformed files skip, so listing never fails.
 * @param scope - store scope
 * @returns Effect resolving to the stored skills
 */
export const list = (scope: StoreScope): Effect.Effect<ReadonlyArray<Skill.Skill>, never> =>
  SkillStore.list(rootOf(scope));

/**
 * Read one skill's raw `SKILL.md` text.
 * @param scope - store scope
 * @param name - skill directory name
 * @returns Effect resolving to the file contents, failing on unknown names
 */
export const load = (scope: StoreScope, name: string): Effect.Effect<string, string> =>
  SkillStore.readRaw(rootOf(scope), name);

/** Verification outcome for one skill. */
export interface VerifyEntry {
  readonly name: string;
  readonly result: Skill.VerifyResult;
}

/** Aggregated verification outcome across one or all skills. */
export interface VerifyReport {
  readonly valid: boolean;
  readonly entries: ReadonlyArray<VerifyEntry>;
  readonly issueCount: number;
}

const missingSkill: Skill.VerifyResult = {
  valid: false,
  issues: [{ field: 'file', message: 'Missing SKILL.md.' }],
};

/**
 * Mechanically verify one skill by name, or every skill under the root
 * when `name` is omitted. Verification is pure; only the file reads can
 * fail, and a directory without a readable `SKILL.md` counts as invalid
 * rather than aborting the whole run.
 * @param scope - store scope
 * @param name - skill name, or undefined to verify every skill
 * @returns Effect resolving to the aggregated report, failing on unknown names
 */
export const verify = (
  scope: StoreScope,
  name: string | undefined,
): Effect.Effect<VerifyReport, string> =>
  Effect.gen(function* () {
    const root = rootOf(scope);
    const targets = name === undefined ? yield* SkillStore.names(root) : [name];
    if (name !== undefined) {
      // A single explicit name must exist; an unknown name is a failure.
      yield* SkillStore.readRaw(root, name).pipe(Effect.mapError(() => `Unknown skill '${name}'.`));
    }
    const entries = yield* Effect.forEach(targets, (target) =>
      SkillStore.readRaw(root, target).pipe(
        Effect.map((raw): VerifyEntry => ({
          name: target,
          result: Skill.verifySkillFile(target, raw),
        })),
        Effect.orElseSucceed((): VerifyEntry => ({ name: target, result: missingSkill })),
      ),
    );
    return {
      valid: entries.every((entry) => entry.result.valid),
      entries,
      issueCount: entries.reduce((sum, entry) => sum + entry.result.issues.length, 0),
    };
  });

/**
 * Create a `SKILL.md` file. The name is slug-validated and becomes the
 * directory; a fresh immutable id and the default author/version/license
 * fill what the caller does not supply.
 * @param scope - store scope
 * @param input - skill fields
 * @returns Effect resolving to the saved skill, failing on invalid fields
 */
export const create = (scope: StoreScope, input: CreateInput): Effect.Effect<Skill.Skill, string> =>
  Effect.gen(function* () {
    if (!Skill.isValidName(input.name)) {
      return yield* Effect.fail(
        `Invalid skill name '${input.name}' — use kebab-case (lowercase, hyphen-separated).`,
      );
    }
    const skill = yield* Skill.decodeUnknown({
      id: input.name,
      name: input.name,
      description: input.description,
      skillId: Skill.generateSkillId(),
      author: input.author ?? Skill.DEFAULT_AUTHOR,
      version: input.version ?? Skill.DEFAULT_VERSION,
      license: input.license ?? Skill.DEFAULT_LICENSE,
      groups: [...input.groups],
      dependencies: [...input.dependencies],
      body: input.body,
    }).pipe(Effect.mapError(() => `Invalid skill fields for '${input.name}'.`));
    yield* SkillStore.save(rootOf(scope), skill);
    return skill;
  });

/**
 * Update a skill in place. Omitted fields keep their stored value; the
 * id is never changed.
 * @param scope - store scope
 * @param input - fields to change
 * @returns Effect resolving to the saved skill, failing on unknown names
 */
export const modify = (scope: StoreScope, input: ModifyInput): Effect.Effect<Skill.Skill, string> =>
  Effect.gen(function* () {
    const root = rootOf(scope);
    const skills = yield* SkillStore.list(root);
    const existing = skills.find(
      (candidate) => candidate.id === input.name || candidate.name === input.name,
    );
    if (existing === undefined) return yield* Effect.fail(`Unknown skill '${input.name}'.`);
    const encoded = Skill.encode(existing);
    const updated = yield* Skill.decodeUnknown({
      ...encoded,
      description: input.description ?? encoded.description,
      author: input.author ?? encoded.author,
      version: input.version ?? encoded.version,
      license: input.license ?? encoded.license,
      groups: input.groups === undefined ? [...encoded.groups] : [...input.groups],
      dependencies:
        input.dependencies === undefined ? [...encoded.dependencies] : [...input.dependencies],
      body: input.body ?? encoded.body,
    }).pipe(Effect.mapError(() => `Invalid skill fields for '${input.name}'.`));
    yield* SkillStore.save(root, updated);
    return updated;
  });

/**
 * Delete a skill directory.
 * @param scope - store scope
 * @param name - skill directory name
 * @returns Effect completing once removed, failing on unknown names
 */
export const remove = (scope: StoreScope, name: string): Effect.Effect<void, string> =>
  SkillStore.remove(rootOf(scope), name);
