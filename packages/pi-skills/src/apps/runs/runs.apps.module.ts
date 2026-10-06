import { Effect, Layer } from 'effect';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import { Runner, Run, Runtime, WorkspaceBridge, type RunDetail } from '@montflow/pi-runs';
import { Interactive } from '../index.js';
import { Skill } from '../../modules/index.js';

/**
 * Agentic flows for `/mf-skills` dispatch runs instead of running a child
 * agent inline: the shared `Interactive` flows keep their shape, but an
 * agentic port never resolves a skill — it starts a run, notifies the
 * session, and unwinds the flow with
 * {@link Interactive.DISPATCHED}. The run writes the file; its
 * completion hook re-reads, canonically re-encodes, and notifies the
 * outcome. Same contract the workspace dashboard uses, so `/mf-skills`
 * and the skills panel behave identically.
 */

/** Notification channel the dispatching Pi session exposes. */
export type NotifyFn = (message: string, type?: 'info' | 'warning' | 'error') => void;

/** Tool allowlist for skill runs: the run reads and writes the skill, nothing else. */
export const RUN_TOOLS: ReadonlyArray<string> = ['read', 'write', 'edit'];

/**
 * Engine start arguments for one dispatched run. Optional engine keys
 * are carried as `| undefined` so a missing model is stated rather than
 * spread in conditionally.
 */
interface EngineStartArgs {
  readonly root: string;
  readonly id: string;
  readonly name: string | undefined;
  readonly prompt: string;
  readonly model: string | undefined;
  readonly tools: ReadonlyArray<string>;
  readonly onSettled: ((detail: RunDetail) => Effect.Effect<void>) | undefined;
}

/**
 * Build a child prompt the same way `AgentRun.buildPrompt` does:
 * preprompt, user prompt, postprompt separated by blank lines. Blank
 * parts drop out.
 * @param preprompt - role and format instructions
 * @param prompt - user request
 * @param postprompt - reply shape
 * @returns assembled prompt text
 */
export const buildRunPrompt = (preprompt: string, prompt: string, postprompt: string): string =>
  [preprompt, prompt, postprompt]
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join('\n\n');

/**
 * Final assistant text from a settled run's transcript, or undefined when
 * the run produced no assistant turn.
 * @param events - stored transcript events
 * @returns last assistant text, if any
 */
export const finalAssistantText = (events: RunDetail['events']): string | undefined =>
  events.findLast((event) => event.role === 'assistant')?.text;

/**
 * How a settled author run's skill was resolved: the reply names the new
 * skill, the id diff is the fallback, several fresh skills are ambiguous.
 * @param reply - final assistant text from the run, if any
 * @param fresh - skills added since the run was dispatched
 */
export type AuthoredPick =
  | { readonly kind: 'one'; readonly id: string }
  | { readonly kind: 'ambiguous'; readonly ids: ReadonlyArray<string> }
  | { readonly kind: 'none' };

/**
 * Resolve the skill a settled author run wrote. Prefers the name the run
 * named in its final reply — correlating concurrent creates to their own
 * run — and falls back to the id diff only when exactly one new skill
 * exists.
 * @param reply - final assistant text from the run, if any
 * @param fresh - skills added since the run was dispatched
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

/** Ports the extension injects into the shared interactive flows. */
export interface SkillRunPorts {
  /**
   * Agentic creation: dispatches an author run, unwinds the flow. The
   * `notify` channel is bound to `cwd` first, so the dispatch notice and
   * the completion outcome reach the dispatching session.
   */
  readonly generateFor: (cwd: string, notify: NotifyFn) => Interactive.SkillGenerator;
  /** Agentic modification: dispatches an editor run, unwinds the flow. */
  readonly modifyFor: (cwd: string, notify: NotifyFn) => Interactive.SkillModifier;
  /** Format-transform: same shape as modify, with the transform prompt. */
  readonly transformFor: (cwd: string, notify: NotifyFn) => Interactive.SkillModifier;
  /** Bind a session's notify channel for a working directory. */
  readonly bind: (root: string, notify: NotifyFn) => void;
  /** Interrupt every live run, then release the per-root runtimes. */
  readonly shutdown: () => Promise<void>;
}

/** Construction inputs; the layer factory is a test seam. */
export interface SkillRunPortsOptions {
  /** Persistence port for a working directory, shared with the flows. */
  readonly storeFor: (cwd: string) => Interactive.SkillStore;
  /** Runner layer factory; defaults to the file-backed engine. */
  readonly layerFor?: (root: string, bridge: Layer.Layer<WorkspaceBridge>) => Layer.Layer<Runner>;
}

/**
 * Build the run-dispatching skill ports. One runner runtime per repo
 * root is created lazily and reused, so a run stays steerable and
 * answerable from the same Pi session for as long as the extension
 * lives; {@link SkillRunPorts.shutdown} interrupts and disposes them.
 * @param options - store port factory plus the optional layer seam
 * @returns the ports the extension registers
 */
export const makeSkillRunPorts = (options: SkillRunPortsOptions): SkillRunPorts => {
  const surfaces = new Map<string, NotifyFn>();

  /** Notify the session that dispatched from `root`, when one is bound. */
  const tell = (root: string, message: string, type?: 'info' | 'error'): void => {
    surfaces.get(root)?.(message, type);
  };

  /** Bind a session's notify channel for a working directory. */
  const bind = (root: string, notify: NotifyFn): void => {
    surfaces.set(root, notify);
  };

  /** Bridge the runner uses for `notify_user` / `toast_user` / errors. */
  const bridgeFor = (root: string): Layer.Layer<WorkspaceBridge> =>
    Layer.succeed(WorkspaceBridge, {
      toast: (message, variant) =>
        Effect.sync(() => tell(root, message, variant === 'error' ? 'error' : 'info')),
      notify: (title, body) => Effect.sync(() => tell(root, `${title}: ${body}`, 'info')),
    });

  // Lazily built, per-repo-root runner runtimes. Mirrors the pi-runs
  // extension: the live-run registry must outlive one command invocation.
  const runtimes = new Map<string, ManagedRuntime.ManagedRuntime<Runner, never>>();

  /** Build (once) the runner runtime for a repo root. */
  const buildRuntime = (root: string): ManagedRuntime.ManagedRuntime<Runner, never> =>
    ManagedRuntime.make(
      options.layerFor?.(root, bridgeFor(root)) ??
        Runtime.runnerLayer({ root, bridge: bridgeFor(root) }),
    );

  /** Start one run through the engine; resolves as soon as it is registered. */
  const start = (
    root: string,
    input: {
      readonly id: string;
      readonly name: string;
      readonly prompt: string;
      readonly modelLabel: string | undefined;
      readonly onSettled: (detail: RunDetail) => Effect.Effect<void>;
    },
  ): Effect.Effect<string, string> => {
    let runtime = runtimes.get(root);
    if (runtime === undefined) {
      runtime = buildRuntime(root);
      runtimes.set(root, runtime);
    }
    return Effect.tryPromise({
      try: () =>
        runtime.runPromise(
          Effect.gen(function* () {
            const runner = yield* Runner;
            const args: EngineStartArgs = {
              root,
              id: input.id,
              name: input.name,
              prompt: input.prompt,
              model: input.modelLabel,
              tools: [...RUN_TOOLS],
              onSettled: input.onSettled,
            };
            yield* runner.start(args);
            return input.id;
          }),
        ),
      catch: (cause) => (cause instanceof Error ? cause.message : String(cause)),
    });
  };

  /**
   * Completion hook for a dispatched editor run: re-read the named
   * skill, refuse a no-op settle by comparing the raw `SKILL.md` to the
   * dispatch snapshot, re-encode it through the store, and notify.
   */
  const modifyCompletion =
    (root: string, runId: string, skillId: string, beforeRaw: string | undefined) =>
    (): Effect.Effect<void> =>
      Effect.gen(function* () {
        const store = options.storeFor(root);
        const afterRaw = yield* store
          .readRaw(skillId)
          .pipe(Effect.match({ onFailure: () => undefined, onSuccess: (raw) => raw }));
        if (afterRaw === undefined || (beforeRaw !== undefined && afterRaw === beforeRaw)) {
          tell(
            root,
            `Run '${runId}' finished without updating skill '${skillId}' — try describing the change differently.`,
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
            `Run '${runId}' wrote an unusable skill '${skillId}' — check its SKILL.md and retry.`,
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
            `Run '${runId}' updated '${skillId}' but it could not be saved: ${failure}`,
            'error',
          );
          return;
        }
        tell(root, `Updated skill '${skillId}'.`);
      });

  /**
   * Completion hook for a dispatched author run: resolve the skill the
   * run wrote (reply-correlated, id-diff fallback), save it canonically,
   * and notify.
   */
  const authorCompletion =
    (root: string, runId: string, beforeIds: ReadonlyArray<string>) =>
    (detail: RunDetail): Effect.Effect<void> =>
      Effect.gen(function* () {
        const store = options.storeFor(root);
        const skills = yield* store
          .list()
          .pipe(Effect.orElseSucceed((): ReadonlyArray<Skill.Skill> => []));
        const fresh = skills.filter((skill) => !beforeIds.includes(skill.id));
        const pick = pickAuthoredSkill(finalAssistantText(detail.events), fresh);
        if (pick.kind === 'none') {
          tell(
            root,
            `Run '${runId}' finished without creating a skill — try describing it differently.`,
            'error',
          );
          return;
        }
        if (pick.kind === 'ambiguous') {
          tell(
            root,
            `Run '${runId}' created several skills (${pick.ids.join(', ')}) — open the one you want.`,
            'error',
          );
          return;
        }
        const created = fresh.find((skill) => skill.id === pick.id);
        if (created === undefined) {
          tell(root, `Run '${runId}' created '${pick.id}' but it could not be read back.`, 'error');
          return;
        }
        const failure = yield* store
          .save(created)
          .pipe(Effect.match({ onFailure: (error) => error, onSuccess: () => undefined }));
        if (failure !== undefined) {
          tell(
            root,
            `Run '${runId}' created '${pick.id}' but it could not be saved: ${failure}`,
            'error',
          );
          return;
        }
        tell(root, `Created skill '${pick.id}'.`);
      });

  /** Dispatch an author run for one description. */
  const generateFor =
    (cwd: string, notify: NotifyFn): Interactive.SkillGenerator =>
    (input) =>
      Effect.gen(function* () {
        bind(cwd, notify);
        const store = options.storeFor(cwd);
        const before = yield* store
          .list()
          .pipe(Effect.orElseSucceed((): ReadonlyArray<Skill.Skill> => []));
        const id = yield* Run.newId('create-skill');
        yield* start(cwd, {
          id,
          name: `Create skill: ${input.description.trim().slice(0, 72)}`,
          prompt: buildRunPrompt(
            Interactive.AUTHOR_PREPROMPT + Skill.formatInjectedSkills(input.inject),
            `Skill description: ${input.description}`,
            Interactive.AUTHOR_POSTPROMPT,
          ),
          modelLabel: input.modelLabel,
          onSettled: authorCompletion(
            cwd,
            id,
            before.map((skill) => skill.id),
          ),
        });
        tell(cwd, `Run '${id}' is creating your skill — follow it with /mf-runs status ${id}.`);
        return yield* Effect.fail(Interactive.DISPATCHED);
      });

  /**
   * Dispatch an editor run for one change request. `preprompt` and
   * naming differ per action (modify vs transform); the dispatch shape
   * does not.
   */
  const editorFor =
    (
      cwd: string,
      notify: NotifyFn,
      naming: { readonly idPrefix: string; readonly title: string },
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
        const id = yield* Run.newId(naming.idPrefix);
        yield* start(cwd, {
          id,
          name: `${naming.title} skill: ${input.skill.id}`,
          prompt: buildRunPrompt(
            preprompt(input),
            `Change request: ${input.instruction}`,
            postprompt,
          ),
          modelLabel: input.modelLabel,
          onSettled: modifyCompletion(cwd, id, input.skill.id, beforeRaw),
        });
        tell(
          cwd,
          `Run '${id}' is updating skill '${input.skill.id}' — follow it with /mf-runs status ${id}.`,
        );
        return yield* Effect.fail(Interactive.DISPATCHED);
      });

  const modifyFor = (cwd: string, notify: NotifyFn): Interactive.SkillModifier =>
    editorFor(
      cwd,
      notify,
      { idPrefix: 'modify-skill', title: 'Modify' },
      (input) =>
        `${Interactive.MODIFY_PREPROMPT}\n\nSkill to edit: ${input.skill.id}${Skill.formatInjectedSkills(input.inject)}`,
      Interactive.MODIFY_POSTPROMPT,
    );

  const transformFor = (cwd: string, notify: NotifyFn): Interactive.SkillModifier =>
    editorFor(
      cwd,
      notify,
      { idPrefix: 'transform-skill', title: 'Transform' },
      (input) =>
        `${Interactive.TRANSFORM_PREPROMPT}\n\nSkill to fix: ${input.skill.id}${Skill.formatInjectedSkills(input.inject)}`,
      Interactive.TRANSFORM_POSTPROMPT,
    );

  /** Interrupt every live run this host started, then release the runtimes. */
  const shutdown = async (): Promise<void> => {
    const all = [...runtimes.entries()];
    runtimes.clear();
    await Promise.all(
      all.map(([root, runtime]) =>
        runtime
          .runPromise(
            Effect.gen(function* () {
              const runner = yield* Runner;
              const runs = yield* runner.list(root).pipe(Effect.orElseSucceed(() => []));
              yield* Effect.forEach(
                runs.filter((run) => run.status === 'running' || run.status === 'awaiting-input'),
                (run) => runner.interrupt(root, run.id).pipe(Effect.catch(() => Effect.void)),
                { discard: true },
              );
            }),
          )
          .catch(() => undefined),
      ),
    );
    await Promise.all(all.map(([, runtime]) => runtime.dispose()));
    surfaces.clear();
  };

  return {
    generateFor,
    modifyFor,
    transformFor,
    bind,
    shutdown,
  };
};
