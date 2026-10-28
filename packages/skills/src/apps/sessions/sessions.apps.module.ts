import type { ModelPort, SessionDispatchPort } from '@montflow/opencode';
import { Effect, type Scope } from 'effect';
import * as SkillStore from '../../modules/skill-store/index.js';
import { Skill } from '../../modules/index.js';
import * as Interactive from '../interactive/index.js';

/**
 * Agentic flows for `/mf-skills` dispatch sessions instead of running a child
 * agent inline: the shared `Interactive` flows keep their shape, but an
 * agentic port never resolves a skill — it starts a native OpenCode session,
 * notifies the session, and unwinds the flow with {@link Interactive.DISPATCHED}.
 * The session writes the file; a settle watcher re-reads, canonically
 * re-encodes, and notifies the outcome.
 */

/** Notification channel the dispatching session exposes. */
export type NotifyFn = (message: string, type?: 'info' | 'warning' | 'error') => void;

/**
 * Build a child prompt the same way `AgentRun.buildPrompt` does:
 * preprompt, user prompt, postprompt separated by blank lines. Blank
 * parts drop out.
 * @param preprompt - role and format instructions
 * @param prompt - user request
 * @param postprompt - reply shape
 * @returns assembled prompt text
 */
export const buildSessionPrompt = (preprompt: string, prompt: string, postprompt: string): string =>
  [preprompt, prompt, postprompt]
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join('\n\n');

/**
 * How a settled author session's skill was resolved: the reply names the new
 * skill, the id diff is the fallback, several fresh skills are ambiguous.
 * @param reply - final assistant text from the session, if any
 * @param fresh - skills added since the session was dispatched
 */
export type AuthoredPick =
  | { readonly kind: 'one'; readonly id: string }
  | { readonly kind: 'ambiguous'; readonly ids: ReadonlyArray<string> }
  | { readonly kind: 'none' };

/**
 * Resolve the skill a settled author session wrote. Prefers the name the session
 * named in its final reply — correlating concurrent creates to their own
 * session — and falls back to the id diff only when exactly one new skill
 * exists.
 * @param reply - final assistant text from the session, if any
 * @param fresh - skills added since the session was dispatched
 * @returns the chosen id, an ambiguity, or none
 */
export const pickAuthoredSkill = (
  reply: string | undefined,
  fresh: ReadonlyArray<Skill.Skill>,
): AuthoredPick => {
  if (fresh.length === 0) return { kind: 'none' };
  const named = reply === undefined ? [] : fresh.filter((skill) => reply.includes(skill.name));
  if (named.length === 1) {
    const skill = named[0];
    if (skill !== undefined) return { kind: 'one', id: skill.id };
  }
  if (fresh.length === 1) {
    const skill = fresh[0];
    if (skill !== undefined) return { kind: 'one', id: skill.id };
  }
  return { kind: 'ambiguous', ids: fresh.map((skill) => skill.id) };
};

/**
 * File-backed `SkillStore` port for the shared interactive flows:
 * `<root>/.agents/skills`. Malformed files skip on list; saves and deletes
 * carry string errors.
 * @param root - workspace root (skill store owner)
 * @returns store port for the interactive flows
 */
export const storeFor = (root: string): Interactive.SkillStore => ({
  list: () => SkillStore.list(root),
  save: (skill) => SkillStore.save(root, skill),
  delete: (id) => SkillStore.remove(root, id),
  readRaw: (id) => SkillStore.readRaw(root, id),
});

/** Ports the extension injects into the shared interactive flows. */
export interface SkillSessionPorts {
  /**
   * Agentic creation: dispatches an author session, unwinds the flow. The
   * `notify` channel is bound to `cwd` first, so the dispatch notice and
   * the completion outcome reach the dispatching session.
   */
  readonly generateFor: (cwd: string, notify: NotifyFn) => Interactive.SkillGenerator;
  /** Agentic modification: dispatches an editor session, unwinds the flow. */
  readonly modifyFor: (cwd: string, notify: NotifyFn) => Interactive.SkillModifier;
  /** Format-transform: same shape as modify, with the transform prompt. */
  readonly transformFor: (cwd: string, notify: NotifyFn) => Interactive.SkillModifier;
}

/** The adapter seams dispatch reads; `ServerPorts` satisfies this slice. */
export interface SkillDispatchPorts {
  readonly session: SessionDispatchPort;
  readonly model: ModelPort;
}

/** Construction inputs; the store factory is a test seam. */
export interface SkillSessionPortsOptions {
  /** Persistence port for a working directory, shared with the flows. */
  readonly storeFor: (cwd: string) => Interactive.SkillStore;
  /** Plugin-owned scope the settle watchers run in. */
  readonly scope: Scope.Scope;
}

/** One native dispatch: what to call the session and what it must do. */
interface DispatchRequest {
  readonly root: string;
  readonly title: string;
  readonly prompt: string;
  readonly modelLabel: string | undefined;
}

/** The branded session id the dispatch port mints. */
type SessionId = Effect.Success<ReturnType<SessionDispatchPort['create']>>;

/**
 * Build the session-dispatching skill ports over native session dispatch. Each
 * agentic flow creates a peer session, prompts it, and leaves a watcher that
 * waits for settlement, reads the last assistant reply, runs the completion
 * hook, and notifies. The watcher is forked into the plugin-owned scope, so it
 * outlives the tool-execute fiber that dispatched it.
 * @param ports - adapter seams (session dispatch + model resolution)
 * @param options - store port factory and the plugin scope
 * @returns the ports the server plugin registers
 */
export const makeSkillSessionPorts = (
  ports: SkillDispatchPorts,
  options: SkillSessionPortsOptions,
): SkillSessionPorts => {
  const surfaces = new Map<string, NotifyFn>();

  /** Notify the session that dispatched from `root`, when one is bound. */
  const tell = (root: string, message: string, type?: 'info' | 'error'): void => {
    surfaces.get(root)?.(message, type);
  };

  /** Bind a session's notify channel for a working directory. */
  const bind = (root: string, notify: NotifyFn): void => {
    surfaces.set(root, notify);
  };

  /**
   * Completion hook for a dispatched editor session: re-read the named
   * skill, refuse a no-op settle by comparing the raw `SKILL.md` to the
   * dispatch snapshot, re-encode it through the store, and notify.
   */
  const modifyCompletion =
    (root: string, sessionId: string, skillId: string, beforeRaw: string | undefined) =>
    (): Effect.Effect<void> =>
      Effect.gen(function* () {
        const store = options.storeFor(root);
        const afterRaw = yield* store
          .readRaw(skillId)
          .pipe(Effect.match({ onFailure: () => undefined, onSuccess: (raw) => raw }));
        if (afterRaw === undefined || (beforeRaw !== undefined && afterRaw === beforeRaw)) {
          tell(
            root,
            `Session '${sessionId}' finished without updating skill '${skillId}' — try describing the change differently.`,
            'error',
          );
          return;
        }
        const skills = yield* store
          .list()
          .pipe(Effect.orElseSucceed((): ReadonlyArray<Skill.Skill> => []));
        const updated = skills.find((skill) => skill.id === skillId);
        if (updated === undefined) {
          tell(
            root,
            `Session '${sessionId}' wrote an unusable skill '${skillId}' — check its SKILL.md and retry.`,
            'error',
          );
          return;
        }
        const failure = yield* store
          .save(updated)
          .pipe(Effect.match({ onFailure: (error) => error, onSuccess: () => undefined }));
        if (failure !== undefined) {
          tell(
            root,
            `Session '${sessionId}' updated '${skillId}' but it could not be saved: ${failure}`,
            'error',
          );
          return;
        }
        tell(root, `Updated skill '${skillId}'.`);
      });

  /**
   * Completion hook for a dispatched author session: resolve the skill the
   * session wrote (reply-correlated, id-diff fallback), save it canonically,
   * and notify.
   */
  const authorCompletion =
    (root: string, sessionId: string, beforeIds: ReadonlyArray<string>) =>
    (reply: string | undefined): Effect.Effect<void> =>
      Effect.gen(function* () {
        const store = options.storeFor(root);
        const skills = yield* store
          .list()
          .pipe(Effect.orElseSucceed((): ReadonlyArray<Skill.Skill> => []));
        const fresh = skills.filter((skill) => !beforeIds.includes(skill.id));
        const pick = pickAuthoredSkill(reply, fresh);
        if (pick.kind === 'none') {
          tell(
            root,
            `Session '${sessionId}' finished without creating a skill — try describing it differently.`,
            'error',
          );
          return;
        }
        if (pick.kind === 'ambiguous') {
          tell(
            root,
            `Session '${sessionId}' created several skills (${pick.ids.join(', ')}) — open the one you want.`,
            'error',
          );
          return;
        }
        const created = fresh.find((skill) => skill.id === pick.id);
        if (created === undefined) {
          tell(
            root,
            `Session '${sessionId}' created '${pick.id}' but it could not be read back.`,
            'error',
          );
          return;
        }
        const failure = yield* store
          .save(created)
          .pipe(Effect.match({ onFailure: (error) => error, onSuccess: () => undefined }));
        if (failure !== undefined) {
          tell(
            root,
            `Session '${sessionId}' created '${pick.id}' but it could not be saved: ${failure}`,
            'error',
          );
          return;
        }
        tell(root, `Created skill '${pick.id}'.`);
      });

  /** Wait for a dispatched session to settle, then run its completion hook. */
  const watch = (
    root: string,
    sessionId: SessionId,
    completion: (reply: string | undefined) => Effect.Effect<void>,
  ): Effect.Effect<void> =>
    ports.session.wait(sessionId).pipe(
      // A failed wait means the session did not settle, so the completion hook
      // must not run; only a missing reply degrades to `undefined`.
      Effect.andThen(ports.session.reply(sessionId).pipe(Effect.orElseSucceed(() => undefined))),
      Effect.flatMap(completion),
      Effect.catchCause(() =>
        Effect.sync(() => {
          tell(root, `Session '${sessionId}' ended before it could be verified.`, 'error');
        }),
      ),
    );

  /** Start one native session and hand its id back as soon as it is prompted. */
  const start = (
    request: DispatchRequest,
    completionFor: (sessionId: SessionId) => (reply: string | undefined) => Effect.Effect<void>,
  ): Effect.Effect<SessionId, string> =>
    Effect.gen(function* () {
      const label = request.modelLabel?.trim() ?? '';
      const model =
        label === ''
          ? undefined
          : yield* ports.model.resolve(label).pipe(Effect.mapError((error) => error.message));
      const title = request.title;
      const sessionId =
        model === undefined
          ? yield* ports.session.create({ title }).pipe(Effect.mapError((error) => error.message))
          : yield* ports.session
              .create({ title, model })
              .pipe(Effect.mapError((error) => error.message));
      yield* ports.session
        .prompt(sessionId, request.prompt)
        .pipe(Effect.mapError((error) => error.message));
      yield* Effect.forkIn(watch(request.root, sessionId, completionFor(sessionId)), options.scope);
      return sessionId;
    });

  /** Dispatch an author session for one description. */
  const generateFor =
    (cwd: string, notify: NotifyFn): Interactive.SkillGenerator =>
    (input) =>
      Effect.gen(function* () {
        bind(cwd, notify);
        const store = options.storeFor(cwd);
        const before = yield* store
          .list()
          .pipe(Effect.orElseSucceed((): ReadonlyArray<Skill.Skill> => []));
        const beforeIds = before.map((skill) => skill.id);
        const id = yield* start(
          {
            root: cwd,
            title: `Create skill: ${input.description.trim().slice(0, 72)}`,
            prompt: buildSessionPrompt(
              Interactive.AUTHOR_PREPROMPT + Skill.formatInjectedSkills(input.inject),
              `Skill description: ${input.description}`,
              Interactive.AUTHOR_POSTPROMPT,
            ),
            modelLabel: input.modelLabel,
          },
          (sessionId) => authorCompletion(cwd, sessionId, beforeIds),
        );
        tell(cwd, `Session '${id}' is creating your skill.`);
        return yield* Effect.fail(Interactive.DISPATCHED);
      });

  /**
   * Dispatch an editor session for one change request. `preprompt` and
   * naming differ per action (modify vs transform); the dispatch shape
   * does not.
   */
  const editorFor =
    (
      cwd: string,
      notify: NotifyFn,
      naming: { readonly title: string },
      preprompt: (input: Interactive.ModifyInput) => string,
      postprompt: string,
    ) =>
    (input: Interactive.ModifyInput) =>
      Effect.gen(function* () {
        bind(cwd, notify);
        const store = options.storeFor(cwd);
        const beforeRaw = yield* store
          .readRaw(input.skill.id)
          .pipe(Effect.match({ onFailure: () => undefined, onSuccess: (raw) => raw }));
        const id = yield* start(
          {
            root: cwd,
            title: `${naming.title} skill: ${input.skill.id}`,
            prompt: buildSessionPrompt(
              preprompt(input),
              `Change request: ${input.instruction}`,
              postprompt,
            ),
            modelLabel: input.modelLabel,
          },
          (sessionId) => () => modifyCompletion(cwd, sessionId, input.skill.id, beforeRaw)(),
        );
        tell(cwd, `Session '${id}' is updating skill '${input.skill.id}'.`);
        return yield* Effect.fail(Interactive.DISPATCHED);
      });

  const modifyFor = (cwd: string, notify: NotifyFn): Interactive.SkillModifier =>
    editorFor(
      cwd,
      notify,
      { title: 'Modify' },
      (input) =>
        `${Interactive.MODIFY_PREPROMPT}\n\nSkill to edit: ${input.skill.id}${Skill.formatInjectedSkills(input.inject)}`,
      Interactive.MODIFY_POSTPROMPT,
    );

  const transformFor = (cwd: string, notify: NotifyFn): Interactive.SkillModifier =>
    editorFor(
      cwd,
      notify,
      { title: 'Transform' },
      (input) =>
        `${Interactive.TRANSFORM_PREPROMPT}\n\nSkill to fix: ${input.skill.id}${Skill.formatInjectedSkills(input.inject)}`,
      Interactive.TRANSFORM_POSTPROMPT,
    );

  return {
    generateFor,
    modifyFor,
    transformFor,
  };
};
