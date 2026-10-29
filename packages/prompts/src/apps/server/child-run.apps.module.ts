import type { ServerPorts } from '@montflow/opencode';
import { Effect } from 'effect';
import type * as PromptExecute from '../../modules/prompt-execute/index.js';

/**
 * Prompt execution over a native session: resolve the persisted
 * `provider/model-id` label, create a session, prompt it with the rendered
 * text (skills first), wait for it to settle, and return its last reply.
 *
 * The retired path ran a child agent through `ModelRuntime`; the native path
 * dispatches a peer session and reads its durable context, so no montflow
 * runtime owns the model loop.
 * @param ports - adapter seam ports from the server plugin
 * @returns executor port for the CLI, tools, and commands
 */
export const makePromptExecutor =
  (ports: ServerPorts): PromptExecute.PromptExecutor =>
  (request) =>
    Effect.gen(function* () {
      const model = yield* ports.model
        .resolve(request.model)
        .pipe(Effect.mapError((error) => error.message));
      const instructions = request.skills
        .map((name) => `Load the '${name}' skill before starting.`)
        .join('\n');
      const text = instructions === '' ? request.text : `${instructions}\n\n${request.text}`;
      const sessionID = yield* ports.session
        .create({
          title: `prompt: ${request.name}`,
          model,
        })
        .pipe(Effect.mapError((error) => error.message));
      yield* ports.session.prompt(sessionID, text).pipe(Effect.mapError((error) => error.message));
      yield* ports.session.wait(sessionID).pipe(Effect.mapError((error) => error.message));
      const reply = yield* ports.session
        .reply(sessionID)
        .pipe(Effect.mapError((error) => error.message));
      return reply ?? `Completed session ${sessionID}.`;
    });
