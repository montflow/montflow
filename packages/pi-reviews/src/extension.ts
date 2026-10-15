import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer, Schema } from 'effect';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { ProfileStore } from '@montflow/pi-profiles';
import { Session } from '@montflow/pi-sessions';
import { SpecStore } from '@montflow/pi-specs';
import { Cli, Dispatch } from './apps/index.js';
import { ProfileProbe, ReviewStore } from './services/index.js';

/** Node platform layers for the services the store needs. */
const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/** Full layer: the file-backed stores plus the lazy `ProfileProbe`. */
const Live = Layer.mergeAll(
  Layer.provide(ReviewStore.Default, NodeLive),
  ProfileProbe.Default,
  Layer.provide(SpecStore.Default, NodeLive),
  Layer.provide(ProfileStore.Default, NodeLive),
);

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
export default function piReviewsExtension(
  pi: Pick<ExtensionAPI, 'registerCommand' | 'registerTool'>,
): Promise<void> {
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
      profile: Type.Optional(
        Type.String({ description: 'Reviewer profile slug to bind the series to.' }),
      ),
      round: Type.Optional(Type.String({ description: 'Exact round to review (e.g. 003).' })),
      phase: Type.Optional(Type.String({ description: 'Spec phase this review belongs to.' })),
      parent: Type.Optional(Type.String({ description: 'Parent session id (the orchestrator).' })),
      model: Type.Optional(Type.String({ description: 'provider/model-id pin for the reviewer.' })),
      thinking: Type.Optional(
        Type.String({ description: 'Thinking level for the reviewer session.' }),
      ),
      dir: Type.Optional(
        Type.String({ description: 'Workspace root; defaults to the session working directory.' }),
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const thinking: Session.ThinkingLevel | undefined =
        params.thinking === undefined
          ? undefined
          : Schema.is(Session.ThinkingLevel)(params.thinking)
            ? params.thinking
            : undefined;
      if (params.thinking !== undefined && thinking === undefined) {
        return textResult(
          `Error: '${params.thinking}' is not a thinking level (off, minimal, low, medium, high, xhigh, max).`,
        );
      }
      const input: Dispatch.ReviewDispatchInput = {
        root: params.dir ?? ctx.cwd,
        name: params.name,
        target: params.target,
        spec: params.spec,
        parent: params.parent,
        profile: params.profile,
        round: params.round,
        phase: params.phase,
        thinking,
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
