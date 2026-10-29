import { NodeFileSystem, NodePath } from '@effect/platform-node';
import type { ToolDefinition } from '@montflow/opencode';
import { PromptStore, type PromptExecute } from '@montflow/prompts';
import { Cause, Effect, Layer, Schema } from 'effect';
import { SpecStore } from '../../services/index.js';
import * as Catalogue from '../../modules/catalogue/index.js';
import {
  author,
  diagnoseCause,
  execute,
  listModels,
  listNameDiagnostic,
  modelsVerifyCommand,
  renderDiagnostic,
  sizingConfig,
  storeDirOf,
  verifyModels,
} from '../cli/index.js';

/**
 * The agent-callable half of the prompt commands: `spec_author` and
 * `spec_execute` load and render the same shipped prompts the binary prints,
 * then dispatch the rendered text through one injected
 * {@link PromptExecute.PromptExecutor}.
 *
 * Two properties matter more than the registration itself:
 *
 * - **One executor, no copied dispatch.** The host passes
 *   `@montflow/prompts`' `makePromptExecutor`, so the model resolution, skill
 *   prelude, and native session lifecycle are the same code path as every
 *   other montflow prompt.
 * - **Same diagnostics as the CLI.** A missing/stale prompt, an unknown spec,
 *   or an ambiguous branch renders through `diagnoseCause`, so the agent reads
 *   the code, path, fix, and `next ask the user` instead of a stack trace.
 */

/** Platform services every tool effect needs. */
const Platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);

/** The stores plus the filesystem `which` reads git metadata through. */
const Live = Layer.mergeAll(
  Layer.provide(SpecStore.Default, Platform),
  Layer.provide(PromptStore.Default, Platform),
  Platform,
);

/** Input for `spec_author`. */
export const SpecAuthorInput = Schema.Struct({
  request: Schema.String,
  notes: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
});

/** Decoded `spec_author` input. */
export type SpecAuthorInput = typeof SpecAuthorInput.Type;

/** Input for `spec_execute`. */
export const SpecExecuteInput = Schema.Struct({
  name: Schema.optional(Schema.String),
  phase: Schema.optional(Schema.String),
  focus: Schema.optional(Schema.String),
  mode: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
});

/** Decoded `spec_execute` input. */
export type SpecExecuteInput = typeof SpecExecuteInput.Type;

/** What the tool factories need: the workspace and the shared executor. */
export interface SpecToolOptions {
  /** Workspace root the plugin runs in; owns `.agents/`. */
  readonly cwd: string;
  /** Renders-then-dispatches the prompt; supplied by the host port. */
  readonly execute: PromptExecute.PromptExecutor;
  /** Host default model label, used when the caller omits `model`. */
  readonly defaultModel?: (() => Effect.Effect<string | undefined>) | undefined;
}

/** Render a caught cause as the same agent-first diagnostic the CLI prints. */
const failureText = (cause: Cause.Cause<unknown>, path: string, rerun: string): string =>
  diagnoseCause(cause, { path, rerun, verbose: false }).output;

/**
 * Resolve the model a dispatched run should use. An explicit label wins; an
 * omitted one falls back to the host default so the optional tool argument
 * does not silently render a prompt with nowhere to run it.
 */
const modelOf = (
  options: SpecToolOptions,
  requested: string | undefined,
): Effect.Effect<string, string> =>
  Effect.gen(function* () {
    const explicit = (requested ?? '').trim();
    if (explicit !== '') return explicit;
    const fallback = yield* options.defaultModel?.() ?? Effect.succeed(undefined);
    if (fallback !== undefined && fallback !== '') return fallback;
    return yield* Effect.fail(
      'No model selected. Pass `model` as provider/model-id, or select a model in the session.',
    );
  });

/** The `spec_author` tool: render `spec-create` and dispatch it on a session. */
export const specAuthorTool = (options: SpecToolOptions): ToolDefinition<SpecAuthorInput> => ({
  name: 'spec_author',
  description:
    "Render the shipped spec-create prompt for a request, then dispatch it on a native session and return the agent's last reply. The prompt, skills, and doctor gate are the same as `mf-specs author`. Pass a model label to override the session default.",
  input: SpecAuthorInput,
  execute: (input) =>
    Effect.gen(function* () {
      const workspace = options.cwd;
      const loaded = yield* author(workspace, { request: input.request, notes: input.notes }).pipe(
        Effect.provide(Live),
        Effect.catchCause((cause) => Effect.fail(failureText(cause, workspace, 'mf-specs author'))),
      );
      const model = yield* modelOf(options, input.model);
      return yield* options.execute({
        cwd: workspace,
        name: loaded.name,
        model,
        text: loaded.text,
        skills: loaded.skills,
      });
    }),
});

/** The `spec_execute` tool: render `spec-execute` and dispatch it on a session. */
export const specExecuteTool = (options: SpecToolOptions): ToolDefinition<SpecExecuteInput> => ({
  name: 'spec_execute',
  description:
    "Derive a spec's state and ready set, render the shipped spec-execute prompt with the phase review budget, then dispatch it on a native session and return the agent's last reply. Omit `name` to resolve the spec from the branch; when that match is absent or ambiguous the failure lists the candidates and says to ask the user, so never pick one yourself. Pass a model label to override the session default.",
  input: SpecExecuteInput,
  execute: (input) =>
    Effect.gen(function* () {
      const workspace = options.cwd;
      const report = yield* execute(storeDirOf(workspace), {
        name: input.name,
        phase: input.phase,
        focus: input.focus,
        mode: input.mode,
        workspace,
      }).pipe(
        Effect.provide(Live),
        Effect.catchCause((cause) =>
          Effect.fail(failureText(cause, storeDirOf(workspace), 'mf-specs execute')),
        ),
      );
      const model = yield* modelOf(options, input.model);
      return yield* options.execute({
        cwd: workspace,
        name: report.prompt.name,
        model,
        text: report.prompt.text,
        skills: report.prompt.skills,
      });
    }),
});

/** The `spec_sizing` tool: render `spec-sizing` and dispatch it on a session. */
export const specSizingTool = (options: SpecToolOptions): ToolDefinition<SpecSizingInput> => ({
  name: 'spec_sizing',
  description:
    'Render the shipped spec-sizing prompt and dispatch it on a native session. It sizes exactly one dispatch-config layer: pass `scope` as repo, spec, or phase; omit it and the prompt asks. `name` alone implies spec, `name` plus `phase` implies phase, and an explicit `scope` wins. Contradictory inputs fail with the corrected command instead of dispatching. The wizard confirms before writing and never invents a model id or effort. Pass a model label to override the session default.',
  input: SpecSizingInput,
  execute: (input) =>
    Effect.gen(function* () {
      const workspace = options.cwd;
      const report = yield* sizingConfig(workspace, {
        scope: input.scope,
        name: input.name,
        phase: input.phase,
        focus: input.focus,
        mode: input.mode,
      }).pipe(
        Effect.provide(Live),
        Effect.catchCause((cause) =>
          Effect.fail(failureText(cause, workspace, 'mf-specs sizing-config')),
        ),
      );
      const model = yield* modelOf(options, input.model);
      return yield* options.execute({
        cwd: workspace,
        name: report.prompt.name,
        model,
        text: report.prompt.text,
        skills: report.prompt.skills,
      });
    }),
});

/** Input for `spec_sizing`. */
export const SpecSizingInput = Schema.Struct({
  scope: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  phase: Schema.optional(Schema.String),
  focus: Schema.optional(Schema.String),
  mode: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
});

/** Decoded `spec_sizing` input. */
export type SpecSizingInput = typeof SpecSizingInput.Type;

/** Input for `spec_models`: read the catalogue or verify a spec's config. */
export const SpecModelsInput = Schema.Struct({
  action: Schema.Literals(['list', 'verify']),
  name: Schema.optional(Schema.String),
  provider: Schema.optional(Schema.String),
});

/** Decoded `spec_models` input. */
export type SpecModelsInput = typeof SpecModelsInput.Type;

/** What `spec_models` needs: the workspace and the host model source. */
export interface ModelsToolOptions {
  /** Workspace root the plugin runs in; owns `.agents/`. */
  readonly cwd: string;
  /** Host model seam; the catalogue is the same one `/specs models` prints. */
  readonly model?: Catalogue.ModelSource | undefined;
}

/**
 * The `spec_models` tool: `list` returns the stable catalogue JSON, `verify`
 * returns the same findings `mf-specs models --verify` prints. Both read the
 * host model port the plugin was built with; neither invents a catalogue.
 */
export const specModelsTool = (options: ModelsToolOptions): ToolDefinition<SpecModelsInput> => ({
  name: 'spec_models',
  description:
    "Read the harness model catalogue. `list` returns the stable catalogue JSON (provider/model ids, effort variants, and the default marker); `verify` cross-checks the repo config and, when `name` is supplied, that spec config including every phase override, returning the same warnings and the same checked/skipped counts as `mf-specs models --verify`. `provider` keeps one provider on either action; a miss is a diagnostic, and on `verify` only that provider's config entries are checked, with the rest counted as skipped. `name` is refused on `list`, exactly as the binary refuses `--name` without `--verify`, because only the verification path can honour it. Unknown variants never produce an effort finding.",
  input: SpecModelsInput,
  execute: (input) =>
    Effect.gen(function* () {
      const root = storeDirOf(options.cwd);
      if (input.action === 'list') {
        // The listing cannot honour `name`, so a supplied one is refused with
        // the same diagnostic `mf-specs models --name` prints — the tool must
        // not return a full catalogue that looks scoped. A blank value means
        // "no name", exactly as on the CLI.
        const name = input.name;
        if (name !== undefined && name.trim() !== '') {
          return yield* Effect.fail(
            renderDiagnostic(
              listNameDiagnostic(name, modelsVerifyCommand({ name, provider: input.provider })),
            ),
          );
        }

        const report = yield* listModels(
          { provider: input.provider, json: true },
          options.model,
        ).pipe(
          Effect.provide(Live),
          Effect.catchCause((cause) => Effect.fail(failureText(cause, root, 'mf-specs models'))),
        );
        return report.output;
      }
      const report = yield* verifyModels(
        root,
        { name: input.name, provider: input.provider },
        options.model,
      ).pipe(
        Effect.provide(Live),
        Effect.catchCause((cause) =>
          Effect.fail(failureText(cause, root, 'mf-specs models --verify')),
        ),
      );
      return report.output;
    }),
});
