import {
  defineAgent,
  type AgentPort,
  type ModelPort,
  type ServerPorts,
  type SessionDispatchPort,
} from '@montflow/opencode';
import { Effect, Scope } from 'effect';
import * as Profiles from '../../modules/profiles/index.js';

/** Prefix keeping profile-backed agents out of the host's built-in id space. */
export const AGENT_PREFIX = 'mf-';

/** Native agent id for a profile slug. */
export const agentIdOf = (name: string): string => `${AGENT_PREFIX}${name}`;

/**
 * Build the host agent definition for one profile: the profile's role is the
 * description, its instructions plus checklist become the system prompt, and
 * a pinned model travels through unchanged.
 * @param profile - decoded PROFILE.md
 * @returns a host-free agent descriptor
 */
export const agentOf = (profile: Profiles.Profile) => {
  const checklist =
    profile.checklist.length === 0
      ? ''
      : `## Review Checklist\n\n${profile.checklist.map((item) => `- [ ] ${item}`).join('\n')}`;
  const system = [profile.instructions.trim(), checklist]
    .filter((part) => part !== '')
    .join('\n\n');
  const base = {
    id: agentIdOf(profile.name),
    name: Profiles.titleFromName(profile.name),
    description: profile.description,
    mode: 'subagent' as const,
  };
  const withSystem = system === '' ? base : { ...base, system };
  return profile.model.trim() === '' ? withSystem : { ...withSystem, model: profile.model.trim() };
};

/** Register every stored profile as a native agent. */
export const syncAgents = (
  ports: ServerPorts,
  profiles: readonly Profiles.Profile[],
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.forEach(
    profiles,
    (profile) =>
      Effect.try(() => defineAgent(agentOf(profile))).pipe(
        Effect.flatMap((agent) => ports.agent.upsert(agent)),
        Effect.catch(() => Effect.void),
      ),
    { discard: true },
  );

/** The adapter seams a profile run reads; `ServerPorts` satisfies this slice. */
export interface ProfileRunPorts {
  readonly agent: AgentPort;
  readonly model: ModelPort;
  readonly session: SessionDispatchPort;
}

/**
 * Run one profile in a native session. The profile's registered agent id
 * selects the system prompt; the task is the prompt text. The agent is
 * upserted first, so a profile created in this session is resolvable.
 * @param ports - adapter seam ports from the server plugin
 * @param profile - profile to run
 * @param task - instruction sent to the agent
 * @param model - model label, falling back to the profile's pinned model
 * @param scope - plugin scope that owns the agent registration
 * @returns the session's last assistant reply, or a receipt
 */
export const runProfile = (
  ports: ProfileRunPorts,
  profile: Profiles.Profile,
  task: string,
  model: string | undefined,
  scope: Scope.Scope,
): Effect.Effect<string, string> =>
  Effect.gen(function* () {
    const definition = yield* Effect.try({
      try: () => defineAgent(agentOf(profile)),
      catch: (cause) =>
        `Profile '${profile.name}' has an invalid model: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
    });
    // Idempotent: the host editor creates the agent when it is missing, so a
    // profile authored after the load-time sync becomes resolvable here. The
    // registration belongs to the plugin scope, not this tool call.
    const label = (model ?? profile.model).trim();
    if (label === '') {
      return yield* Effect.fail(
        `Profile '${profile.name}' pins no model; pass one as provider/model-id.`,
      );
    }
    const resolved = yield* ports.model
      .resolve(label)
      .pipe(Effect.mapError((error) => error.message));
    yield* ports.agent.upsert(definition).pipe(Effect.provideService(Scope.Scope, scope));
    const sessionID = yield* ports.session
      .create({
        title: `profile: ${profile.name}`,
        agent: definition.id,
        model: resolved,
      })
      .pipe(Effect.mapError((error) => error.message));
    yield* ports.session.prompt(sessionID, task).pipe(Effect.mapError((error) => error.message));
    yield* ports.session.wait(sessionID).pipe(Effect.mapError((error) => error.message));
    const reply = yield* ports.session
      .reply(sessionID)
      .pipe(Effect.mapError((error) => error.message));
    return reply ?? `Completed session ${sessionID}.`;
  });
