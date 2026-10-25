import { AbsolutePath } from '@opencode/schema/schema';
import { Skill as SkillSchema } from '@opencode/schema/skill';
import { Effect, type Scope } from 'effect';

/** The slice of the host `SkillEditor` the port drives. */
export interface SkillEditor {
  list(): readonly SkillSchema.Info[];
  get(id: string): SkillSchema.Info | undefined;
  add(skill: SkillSchema.Info): void;
  remove(id: string): void;
}

/** The slice of the host server context `SkillPort` needs. */
export interface SkillContext {
  readonly skill?:
    | {
        readonly transform: (
          callback: (editor: SkillEditor) => void,
        ) => Effect.Effect<{ readonly dispose: Effect.Effect<void> }, never, Scope.Scope>;
      }
    | undefined;
}

/**
 * Skill registry seam. Host-free domain code describes a skill in
 * {@link SkillDefinition} terms and gets it registered with {@link defineSkill},
 * so no concern package imports `@opencode/*`.
 */
export interface SkillPort {
  readonly list: () => Effect.Effect<readonly SkillSchema.Info[]>;
  readonly get: (id: string) => Effect.Effect<SkillSchema.Info | undefined>;
  /** Registers a transform owned by the calling plugin scope. */
  readonly add: (skill: SkillSchema.Info) => Effect.Effect<void, never, Scope.Scope>;
  /** Registers a removal transform owned by the calling plugin scope. */
  readonly remove: (id: string) => Effect.Effect<void, never, Scope.Scope>;
}

const unavailable = (): Error =>
  new Error('SkillPort requires a server plugin context (ctx.skill)');

/** Host-free description of one skill, as a workspace store knows it. */
export interface SkillDefinition {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  /** Absolute `SKILL.md` path the host reads the skill from. */
  readonly path: string;
  readonly content: string;
  readonly autoinvoke?: boolean;
}

/** Build a host `Skill.Info` from a plain descriptor. */
export const defineSkill = (definition: SkillDefinition): SkillSchema.Info => {
  const skill = {
    id: SkillSchema.ID.make(definition.id),
    name: SkillSchema.Name.make(definition.name),
    path: AbsolutePath.make(definition.path),
    content: definition.content,
  };
  const withDescription =
    definition.description === undefined
      ? skill
      : { ...skill, description: definition.description };
  return definition.autoinvoke === undefined
    ? withDescription
    : { ...withDescription, autoinvoke: definition.autoinvoke };
};

/** Run a callback over the host skill editor inside a closed scope. */
const read = <A>(context: SkillContext, select: (editor: SkillEditor) => A): Effect.Effect<A> => {
  const domain = context.skill;
  if (domain === undefined) return Effect.die(unavailable());
  return Effect.gen(function* () {
    let value: A | undefined;
    const registration = yield* domain.transform((editor) => {
      value = select(editor);
    });
    yield* registration.dispose;
    // SAFETY: `transform` runs the callback synchronously, so `select` assigns
    // before the scope closes; a host contract change dies here, not silently.
    return value as A;
  }).pipe(Effect.scoped);
};

/**
 * Register a mutation with the host transform. The host rebuilds state from
 * every live transform on each read, so disposing here would discard the
 * mutation; the registration lives for the caller's plugin scope instead.
 */
const write = (
  context: SkillContext,
  apply: (editor: SkillEditor) => void,
): Effect.Effect<void, never, Scope.Scope> => {
  const domain = context.skill;
  if (domain === undefined) return Effect.die(unavailable());
  return Effect.asVoid(domain.transform(apply));
};

/** Build the skill seam over the host skill domain. */
export const makeSkillPort = (context: SkillContext): SkillPort => ({
  list: () => read(context, (editor) => editor.list()),
  get: (id) => read(context, (editor) => editor.get(id)),
  add: (skill) => write(context, (editor) => editor.add(skill)),
  remove: (id) => write(context, (editor) => editor.remove(id)),
});
