import { test, expect, vi } from 'vitest';
import { Effect } from 'effect';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import {
  agentError,
  reportTool,
  resolveModelObject,
  runOneTurn,
  type SessionModel,
} from '../runner';

// ─── agentError ──────────────────────────────────────────────────────

test('agentError: prefixes the model so the failing agent is identifiable', () => {
  expect(
    agentError('opencode-go/deepseek-v4-flash', new Error('No API key found for undefined.')),
  ).toBe('opencode-go/deepseek-v4-flash — No API key found for undefined.');
});

test('agentError: handles non-Error thrown values', () => {
  expect(agentError('deepseek-v4-pro', 'boom')).toBe('deepseek-v4-pro — boom');
});

test('agentError: model id comes first even for multi-line pi errors', () => {
  const piError = new Error(
    'No API key found for undefined.\n\nUse /login to log into a provider via OAuth or API key.',
  );
  expect(agentError('openai/gpt-5', piError)).toBe(
    'openai/gpt-5 — No API key found for undefined.\n\nUse /login to log into a provider via OAuth or API key.',
  );
});

// ─── resolveModelObject ──────────────────────────────────────────────

/** A fake model as it appears in the runtime (provider + id are what pi needs). */
const fakeModel = (provider: string, id: string): SessionModel =>
  ({ provider, id }) as unknown as SessionModel;

const lookup = {
  getModel: (provider: string, modelId: string) =>
    provider === 'opencode-go' && modelId === 'deepseek-v4-flash'
      ? fakeModel('opencode-go', 'deepseek-v4-flash')
      : undefined,
  getModels: () => [
    fakeModel('opencode-go', 'deepseek-v4-flash'),
    fakeModel('anthropic', 'claude-sonnet-4-5'),
  ],
};

test('resolveModelObject: resolves provider/model-id to a real Model object', () => {
  const model = resolveModelObject(lookup, 'opencode-go/deepseek-v4-flash');
  expect(model).not.toBeUndefined();
  // The resolved object has a provider — not a bare string (a string has no
  // `.provider`, which is what made pi report "No API key found for undefined").
  expect(typeof model?.provider).toBe('string');
  expect(model?.provider).toBe('opencode-go');
  expect(model?.id).toBe('deepseek-v4-flash');
});

test('resolveModelObject: resolves a bare model id by searching providers', () => {
  const model = resolveModelObject(lookup, 'claude-sonnet-4-5');
  expect(model?.provider).toBe('anthropic');
});

test('resolveModelObject: returns undefined for an unknown model', () => {
  expect(resolveModelObject(lookup, 'unknown/model')).toBeUndefined();
  expect(resolveModelObject(lookup, 'nope-model')).toBeUndefined();
});

test('resolveModelObject: returns undefined for an undefined model id instead of throwing', () => {
  // An unset fixer/reviewer model (e.g. runGraph fallback with opts.fixerModel
  // missing) must resolve to undefined, not a TypeError on id.indexOf.
  expect(resolveModelObject(lookup, undefined)).toBeUndefined();
});

// ─── reportTool ──────────────────────────────────────────────────────

test('reportTool: maps tool events to start/end/error activities', () => {
  const onTool = vi.fn();
  reportTool(onTool, { type: 'tool_execution_start', toolName: 'read' } as never);
  reportTool(onTool, { type: 'tool_execution_end', toolName: 'read', isError: false } as never);
  reportTool(onTool, { type: 'tool_execution_end', toolName: 'grep', isError: true } as never);

  expect(onTool).toHaveBeenNthCalledWith(1, { kind: 'start', tool: 'read' });
  expect(onTool).toHaveBeenNthCalledWith(2, { kind: 'end', tool: 'read' });
  expect(onTool).toHaveBeenNthCalledWith(3, { kind: 'error', tool: 'grep' });
});

test('reportTool: no callback → no-op', () => {
  expect(() =>
    reportTool(undefined, { type: 'tool_execution_start', toolName: 'read' } as never),
  ).not.toThrow();
});

// ─── runOneTurn timeout aborts the in-flight generation ────────────────

/**
 * Fake AgentSession whose first prompt never settles (a slow model) and whose
 * `prompt` rejects with pi's "already processing a prompt" busy error while a
 * run is active. `abort()` cancels the in-flight run, mirroring
 * AgentSession.abort(). Later prompts settle and emit an assistant
 * `message_end` (a successful retry turn).
 */
const fakeSlowSession = () => {
  let activeRun: (() => void) | undefined;
  let promptCalls = 0;
  const listeners: ((event: unknown) => void)[] = [];
  const session = {
    subscribe: vi.fn((listener: (event: unknown) => void) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    }),
    prompt: vi.fn((_task: string) => {
      promptCalls += 1;
      if (activeRun !== undefined) {
        return Promise.reject(
          new Error(
            'Agent is already processing a prompt. Use steer() or followUp() to queue messages, or wait for completion.',
          ),
        );
      }
      if (promptCalls === 1) {
        // Slow model: the generation stays in-flight until aborted.
        return new Promise<void>((resolve) => {
          activeRun = resolve;
        });
      }
      // A successful retry turn on the same session.
      listeners.forEach((listener) =>
        listener({
          type: 'message_end',
          message: { role: 'assistant', content: 'retry answer' },
        }),
      );
      return Promise.resolve();
    }),
    abort: vi.fn(() => {
      activeRun?.();
      activeRun = undefined;
      return Promise.resolve();
    }),
    agent: {
      waitForIdle: vi.fn(() => Promise.resolve()),
    },
  };
  return { session: session as unknown as AgentSession, abort: session.abort };
};

test('runOneTurn: a timed-out prompt aborts the in-flight generation so the same session can be re-prompted', async () => {
  const { session, abort } = fakeSlowSession();

  const timedOut = await Effect.runPromise(
    runOneTurn(session, 'slow task', 'test-model', 50),
  );
  expect(timedOut.error).toContain('timed out after 50ms');
  // The timeout result is marked so callers that reuse the session can treat
  // it as poisoned (dispose + recreate) instead of re-prompting it.
  expect(timedOut.timedOut).toBe(true);

  // Effect.timeoutOption interrupted the effect, but the plain prompt promise
  // is still running — the fix must call session.abort() to cancel it.
  expect(abort).toHaveBeenCalledTimes(1);

  // The same persistent session is reused for the retry: no pi "busy" error,
  // and the retry turn completes normally with its own assistant text.
  const retry = await Effect.runPromise(
    runOneTurn(session, 'retry task', 'test-model', 1000),
  );
  expect(retry.error).toBeUndefined();
  expect(retry.text).toBe('retry answer');
});

test('runOneTurn: still marks timedOut when the provider ignores the abort signal', async () => {
  // A provider that ignores abort: the prompt never settles AND abort never
  // resolves, so the generation is STILL running when runOneTurn returns.
  // The abort wait is bounded by abortGraceMs (20ms here) so the loop can't
  // block for the full 30s grace, and the caller still sees timedOut: true
  // to know the session must not be re-prompted.
  const session = {
    subscribe: vi.fn(() => () => undefined),
    prompt: vi.fn(() => new Promise<void>(() => {})),
    abort: vi.fn(() => new Promise<void>(() => {})),
    agent: { waitForIdle: vi.fn(() => Promise.resolve()) },
  } as unknown as AgentSession;

  const result = await Effect.runPromise(
    runOneTurn(session, 'slow task', 'test-model', 50, undefined, 20),
  );
  expect(result.timedOut).toBe(true);
  expect(result.error).toContain('timed out after 50ms');
});
