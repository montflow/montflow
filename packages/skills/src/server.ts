import { defineTool, entry, type Ports } from '@montflow/opencode';
import { Effect, Schema, type Scope } from 'effect';
import { Interactive } from './apps/index.js';
import * as Cli from './apps/cli/index.js';
import { syncSkills } from './apps/server/index.js';
// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- native dispatch factory, not an Effect service; B002 §6 keeps dispatch out of a Layer.
import { makeSkillSessionPorts, storeFor } from './apps/sessions/index.js';
import { Skill, SkillStore } from './modules/index.js';

/** Plugin id shared by the server and TUI entries. */
export const ID = 'skills';

/** Slash command registered by the server plugin (invoke as `/mf-skills`). */
export const COMMAND_NAME = Cli.COMMAND_NAME;

/** Help text shown for the slash command. */
export const COMMAND_DESCRIPTION = Cli.COMMAND_DESCRIPTION;

/** Log a command result where the server host can see it. */
const notify = (message: string): void => {
  Effect.logInfo(message).pipe(Effect.runSync);
};

/** Load one stored skill by id, failing with an agent-readable message. */
const loadSkill = (cwd: string, id: string): Effect.Effect<Skill.Skill, string> =>
  Effect.gen(function* () {
    const skills = yield* SkillStore.list(cwd);
    const found = skills.find((skill) => skill.id === id);
    return found === undefined
      ? yield* Effect.fail(
          `Unknown skill '${id}'. Run \`/mf-skills list\` to see the available names.`,
        )
      : found;
  });

/** Resolve the skills a dispatch should inject, failing on an unknown id. */
const loadInjects = (
  cwd: string,
  ids: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<Skill.Skill>, string> =>
  Effect.forEach(ids, (id) => loadSkill(cwd, id));

/**
 * Report a dispatch instead of its unwound `DISPATCHED` marker: the session,
 * not the tool call, does the writing.
 */
const reportDispatch = (
  effect: Effect.Effect<Skill.Skill, string>,
  what: string,
): Effect.Effect<string, string> =>
  effect.pipe(
    Effect.as(`Session dispatched to ${what}.`),
    Effect.catch((error) =>
      error === Interactive.DISPATCHED
        ? Effect.succeed(`Session dispatched to ${what}.`)
        : Effect.fail(error),
    ),
  );

/**
 * Agentic dispatch tools. Each returns as soon as the session is prompted;
 * the dispatched session writes the file and the settle watcher reports the
 * outcome through the host log.
 */
const registerDispatchTools = (ports: Ports): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const dispatch = makeSkillSessionPorts(ports, { storeFor });

    yield* ports.tool.add(
      defineTool({
        name: 'skill_create',
        description:
          'Author one new workspace skill from a description by dispatching a native agent session. The session writes `.agents/skills/<name>/SKILL.md` and the result is reported when it settles. Returns as soon as the session is prompted.',
        input: Schema.Struct({
          description: Schema.String,
          model: Schema.optional(Schema.String),
          inject: Schema.optional(Schema.Array(Schema.String)),
        }),
        execute: (input) =>
          Effect.gen(function* () {
            const inject = yield* loadInjects(ports.cwd, input.inject ?? []);
            return yield* reportDispatch(
              dispatch.generateFor(
                ports.cwd,
                notify,
              )({
                description: input.description,
                modelLabel: input.model,
                inject,
              }),
              'author a skill',
            );
          }),
      }),
    );

    yield* ports.tool.add(
      defineTool({
        name: 'skill_modify',
        description:
          'Edit one existing workspace skill by dispatching a native agent session with the change request. The session rewrites the named `.agents/skills/<name>/SKILL.md`; the result is reported when it settles.',
        input: Schema.Struct({
          name: Schema.String,
          instruction: Schema.String,
          model: Schema.optional(Schema.String),
          inject: Schema.optional(Schema.Array(Schema.String)),
        }),
        execute: (input) =>
          Effect.gen(function* () {
            const skill = yield* loadSkill(ports.cwd, input.name);
            const inject = yield* loadInjects(ports.cwd, input.inject ?? []);
            return yield* reportDispatch(
              dispatch.modifyFor(
                ports.cwd,
                notify,
              )({
                skill,
                instruction: input.instruction,
                modelLabel: input.model,
                inject,
              }),
              `update skill '${input.name}'`,
            );
          }),
      }),
    );

    yield* ports.tool.add(
      defineTool({
        name: 'skill_transform',
        description:
          'Bring one existing workspace skill into the standard skill format by dispatching a native agent session. Fixes shape only, not what the skill teaches.',
        input: Schema.Struct({
          name: Schema.String,
          instruction: Schema.optional(Schema.String),
          model: Schema.optional(Schema.String),
          inject: Schema.optional(Schema.Array(Schema.String)),
        }),
        execute: (input) =>
          Effect.gen(function* () {
            const skill = yield* loadSkill(ports.cwd, input.name);
            const inject = yield* loadInjects(ports.cwd, input.inject ?? []);
            return yield* reportDispatch(
              dispatch.transformFor(
                ports.cwd,
                notify,
              )({
                skill,
                instruction: input.instruction ?? 'Bring this skill into the standard format.',
                modelLabel: input.model,
                inject,
              }),
              `transform skill '${input.name}'`,
            );
          }),
      }),
    );
  });

/**
 * OpenCode server plugin entry: publishes stored skills into the host skill
 * registry, registers `/mf-skills` for the headless CLI, and registers the
 * agentic dispatch tools. Every child run is a native session.
 */
export default entry(ID, (ports) =>
  Effect.gen(function* () {
    yield* syncSkills(ports, ports.cwd);
    yield* ports.command.register({
      name: COMMAND_NAME,
      description: COMMAND_DESCRIPTION,
      execute: (invocation) =>
        Cli.run(invocation.prompt.text, { notify }, ports.cwd).pipe(
          Effect.catch((message) => Effect.sync(() => notify(message))),
        ),
    });
    yield* registerDispatchTools(ports);
  }),
);
