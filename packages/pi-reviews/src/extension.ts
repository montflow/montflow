import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { Cli, Dispatch } from './apps/index.js';
import { ProfileProbe, ReviewStore } from './services/index.js';

/** Node platform layers for the services the store needs. */
const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/** Full layer: file-backed `ReviewStore` plus the lazy `ProfileProbe`. */
const Live = Layer.merge(Layer.provide(ReviewStore.Default, NodeLive), ProfileProbe.Default);

/** `provider/model-id` for the session model, or undefined when none is active. */
const modelLabelOf = (
  model: { readonly provider: string; readonly id: string } | undefined,
): string | undefined => (model === undefined ? undefined : `${model.provider}/${model.id}`);

/** Tool result shape for rendered text. */
const textResult = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  details: {},
});

/**
 * Pi extension entry: the `/mf-reviews` slash command, plus the in-session
 * `review_create` tool that spawns an isolated reviewer session through the session's
 * session runner host (a short-lived CLI process cannot keep a session alive). The loader
 * awaits the returned promise, so load failures surface.
 * @param pi - Pi extension API
 * @returns Promise settling once registration completes
 */
export default function piReviewsExtension(pi: ExtensionAPI): Promise<void> {
  pi.registerTool({
    name: 'review_create',
    label: 'Create review',
    description:
      'Start an adversarial review session for a review series (e.g. a spec phase review). Ensures the series exists, then spawns the isolated reviewer and returns its session id. Follow it with session_status; resume a stopped reviewer with session_resume.',
    promptSnippet: 'review_create — start a review session for a spec phase',
    parameters: Type.Object({
      name: Type.String({ description: 'Review series name (kebab-case slug).' }),
      target: Type.Optional(Type.String({ description: 'What the review targets.' })),
      spec: Type.Optional(Type.String({ description: 'Spec slug this review belongs to.' })),
      parent: Type.Optional(Type.String({ description: 'Parent session id (the orchestrator).' })),
      model: Type.Optional(Type.String({ description: 'provider/model-id pin for the reviewer.' })),
      dir: Type.Optional(
        Type.String({ description: 'Workspace root; defaults to the session working directory.' }),
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const input: Dispatch.ReviewDispatchInput = {
        root: params.dir ?? ctx.cwd,
        name: params.name,
        target: params.target,
        spec: params.spec,
        parent: params.parent,
        model: params.model ?? modelLabelOf(ctx.model),
      };
      const text = await Dispatch.startReview(input).pipe(
        Effect.provide(Live),
        Effect.matchEffect({
          onFailure: (error) => Effect.succeed(`Error: ${error}`),
          onSuccess: (result) =>
            Effect.succeed(
              `Started review session '${result.sessionId}' for series '${result.series}'.`,
            ),
        }),
        Effect.runPromise,
      );
      return textResult(text);
    },
  });

  return Cli.register(pi, Live).pipe(Effect.runPromise);
}
