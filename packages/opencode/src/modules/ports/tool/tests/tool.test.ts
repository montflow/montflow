import { Effect, Schema } from 'effect';
import * as Vitest from '@effect/vitest';
import { Agent } from '@opencode/schema/agent';
import { Session } from '@opencode/schema/session';
import { SessionMessage } from '@opencode/schema/session-message';
import { Tool } from '@opencode/schema/tool';
import * as ToolPort from '../index.js';

const input = Schema.Struct({ name: Schema.String });

const definition = (execute: ToolPort.ToolDefinition<{ readonly name: string }>['execute']) =>
  ToolPort.defineTool({ name: 'prompt_inspect', description: 'inspect', input, execute });

const makeContext = (registered: Array<Tool.Info & { readonly id: string }> = []) => {
  const added: Array<Tool.Info> = [];
  const updated: Array<string> = [];
  const removed: Array<string> = [];
  const context: ToolPort.ToolContext = {
    tool: {
      transform: (callback) =>
        Effect.sync(() => {
          callback({
            list: () => registered,
            add: (tool) => {
              added.push(tool);
            },
            update: (id, update) => {
              updated.push(id);
              const tool = registered.find((candidate) => candidate.id === id);
              if (tool !== undefined) update(tool);
            },
            remove: (id) => {
              removed.push(id);
            },
          });
          return { dispose: Effect.void };
        }),
      list: () => Effect.succeed(registered),
    },
  };
  return { context, added, updated, removed };
};

const runContext: Tool.Context = {
  sessionID: Session.ID.make('ses_test'),
  agent: Agent.ID.make('mf-reviewer'),
  messageID: SessionMessage.ID.make('msg_test'),
  id: Tool.CallID.make('call_test'),
  progress: () => Effect.void,
};

/** Registry entry the update test mutates. */
const existingTool = (): Tool.Info & { readonly id: string } => ({
  id: 'existing',
  name: 'existing',
  description: '',
  input,
  execute: () => Effect.succeed({ content: 'ok' }),
});

Vitest.describe('ToolPort runtime', () => {
  Vitest.it.effect('defineTool maps a host-free descriptor onto Tool.Info', () =>
    Effect.gen(function* () {
      let seen: ToolPort.ToolRunContext | undefined;
      const tool = definition((values, context) =>
        Effect.sync(() => {
          seen = context;
          return `inspected ${values.name}`;
        }),
      );
      Vitest.expect(tool.name).toBe('prompt_inspect');
      Vitest.expect(tool.description).toBe('inspect');
      Vitest.expect(tool.input).toBe(input);
      const result = yield* tool.execute({ name: 'reviewer' }, runContext);
      Vitest.expect(result).toStrictEqual({ content: 'inspected reviewer' });
      Vitest.expect(seen).toStrictEqual({ sessionID: 'ses_test', agentID: 'mf-reviewer' });
    }),
  );

  Vitest.it.effect('defineTool turns a displayable failure into a Tool.Error', () =>
    Effect.gen(function* () {
      const tool = definition(() => Effect.fail('boom'));
      const error = yield* tool.execute({ name: 'reviewer' }, runContext).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(Tool.Error);
      Vitest.expect(error.message).toBe('boom');
    }),
  );

  Vitest.it.effect('add, update, and remove drive the host editor', () =>
    Effect.gen(function* () {
      const existing = existingTool();
      const { context, added, updated, removed } = makeContext([existing]);
      const port = ToolPort.makeToolPort(context);
      const tool = definition(() => Effect.succeed('ok'));
      yield* port.add(tool).pipe(Effect.scoped);
      yield* port
        .update('existing', (current) => {
          Object.assign(current, { description: 'changed' });
        })
        .pipe(Effect.scoped);
      yield* port.remove('existing').pipe(Effect.scoped);
      Vitest.expect(added).toStrictEqual([tool]);
      Vitest.expect(updated).toStrictEqual(['existing']);
      Vitest.expect(existing.description).toBe('changed');
      Vitest.expect(removed).toStrictEqual(['existing']);
    }),
  );

  Vitest.it.effect('list reads the host registry', () =>
    Effect.gen(function* () {
      const { context } = makeContext();
      const port = ToolPort.makeToolPort(context);
      Vitest.expect(yield* port.list()).toStrictEqual([]);
    }),
  );

  Vitest.it.effect('fails at call time without a server context', () =>
    Effect.gen(function* () {
      const port = ToolPort.makeToolPort({});
      const error = yield* port.add(definition(() => Effect.succeed('ok'))).pipe(
        Effect.catchDefect((defect) => Effect.fail(defect)),
        Effect.flip,
        Effect.scoped,
      );
      Vitest.expect(error).toBeInstanceOf(Error);
    }),
  );
});
