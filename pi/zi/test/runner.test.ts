import { test, expect, vi } from 'vitest';
import { Effect } from 'effect';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import {
  AgentRunError,
  agentError,
  classifyFailure,
  reportTool,
  resolveModelObject,
  retryPrompt,
  runAgentResilient,
  runOneTurn,
  type AgentRunOptions,
  type AgentRunResult,
  type PersistentAgent,
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
  reportTool(onTool, { type: 'tool_execution_start', toolName: 'read', args: { path: 'a.ts', limit: 40 } } as never);
  reportTool(onTool, { type: 'tool_execution_end', toolName: 'read', isError: false } as never);
  reportTool(onTool, { type: 'tool_execution_end', toolName: 'grep', isError: true } as never);

  expect(onTool).toHaveBeenNthCalledWith(1, {
    kind: 'start',
    tool: 'read',
    args: { path: 'a.ts', limit: 40 },
  });
  expect(onTool).toHaveBeenNthCalledWith(2, { kind: 'end', tool: 'read' });
  expect(onTool).toHaveBeenNthCalledWith(3, { kind: 'error', tool: 'grep' });
});

test('reportTool: no callback → no-op', () => {
  expect(() =>
    reportTool(undefined, { type: 'tool_execution_start', toolName: 'read' } as never),
  ).not.toThrow();
});

// ─── runOneTurn live stream deltas ────────────────────────────────────

test('runOneTurn: forwards text_delta and thinking_delta to onDelta', async () => {
  const deltas: Array<[string, string]> = [];
  const session = {
    subscribe: vi.fn((listener: (event: unknown) => void) => {
      // Emit a normal turn: one text chunk, a thinking chunk, then the
      // final message_end (the extracted assistant text).
      listener({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'Hello ' },
      });
      listener({
        type: 'message_update',
        assistantMessageEvent: { type: 'thinking_delta', delta: 'hmm…' },
      });
      listener({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'world' },
      });
      listener({
        type: 'message_end',
        message: { role: 'assistant', content: 'Hello world' },
      });
      return () => undefined;
    }),
    prompt: vi.fn(() => Promise.resolve()),
    abort: vi.fn(() => Promise.resolve()),
    agent: { waitForIdle: vi.fn(() => Promise.resolve()) },
  } as unknown as AgentSession;

  const onDelta = vi.fn((delta: string, kind: string) => {
    deltas.push([delta, kind]);
  });
  const result = await Effect.runPromise(
    runOneTurn(session, 'task', 'test-model', 1000, undefined, onDelta),
  );

  expect(result.error).toBeUndefined();
  expect(result.text).toBe('Hello world');
  // Only the text/thinking deltas are forwarded — never tool or end events.
  expect(onDelta).toHaveBeenCalledTimes(3);
  expect(onDelta).toHaveBeenNthCalledWith(1, 'Hello ', 'text');
  expect(onDelta).toHaveBeenNthCalledWith(2, 'hmm…', 'thinking');
  expect(onDelta).toHaveBeenNthCalledWith(3, 'world', 'text');
});

test('runOneTurn: no onDelta → message deltas are silently ignored', async () => {
  const session = {
    subscribe: vi.fn((listener: (event: unknown) => void) => {
      listener({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'ignored' },
      });
      listener({
        type: 'message_end',
        message: { role: 'assistant', content: 'done' },
      });
      return () => undefined;
    }),
    prompt: vi.fn(() => Promise.resolve()),
    abort: vi.fn(() => Promise.resolve()),
    agent: { waitForIdle: vi.fn(() => Promise.resolve()) },
  } as unknown as AgentSession;

  const result = await Effect.runPromise(runOneTurn(session, 'task', 'test-model', 1000));
  expect(result.error).toBeUndefined();
  expect(result.text).toBe('done');
});

test('runOneTurn: onUsage receives the summed usage of the turn\'s assistant messages', async () => {
  const session = {
    subscribe: vi.fn((listener: (event: unknown) => void) => {
      listener({
        type: 'message_end',
        message: {
          role: 'assistant',
          content: 'first',
          usage: {
            input: 100,
            output: 50,
            cacheRead: 10,
            cacheWrite: 0,
            totalTokens: 160,
            cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 },
          },
        },
      });
      listener({
        type: 'message_end',
        message: {
          role: 'assistant',
          content: 'second',
          usage: {
            input: 200,
            output: 25,
            cacheRead: 0,
            cacheWrite: 5,
            totalTokens: 230,
            cost: { input: 0.002, output: 0.001, cacheRead: 0, cacheWrite: 0, total: 0.003 },
          },
        },
      });
      return () => undefined;
    }),
    prompt: vi.fn(() => Promise.resolve()),
    abort: vi.fn(() => Promise.resolve()),
    agent: { waitForIdle: vi.fn(() => Promise.resolve()) },
  } as unknown as AgentSession;

  const usages: unknown[] = [];
  const result = await Effect.runPromise(
    runOneTurn(
      session,
      'task',
      'test-model',
      1000,
      undefined,
      undefined,
      undefined,
      (usage) => usages.push(usage),
    ),
  );
  expect(result.error).toBeUndefined();
  // One aggregated callback per turn, summing both assistant messages.
  expect(usages).toEqual([
    { input: 300, output: 75, cacheRead: 10, cacheWrite: 5, cost: { total: 0.006 } },
  ]);
});

test('runOneTurn: onUsage is skipped when no assistant message reports usage', async () => {
  const session = {
    subscribe: vi.fn((listener: (event: unknown) => void) => {
      listener({
        type: 'message_end',
        message: { role: 'assistant', content: 'done' },
      });
      return () => undefined;
    }),
    prompt: vi.fn(() => Promise.resolve()),
    abort: vi.fn(() => Promise.resolve()),
    agent: { waitForIdle: vi.fn(() => Promise.resolve()) },
  } as unknown as AgentSession;

  const onUsage = vi.fn();
  const result = await Effect.runPromise(
    runOneTurn(session, 'task', 'test-model', 1000, undefined, undefined, undefined, onUsage),
  );
  expect(result.error).toBeUndefined();
  expect(onUsage).not.toHaveBeenCalled();
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
    runOneTurn(session, 'slow task', 'test-model', 50, undefined, undefined, 20),
  );
  expect(result.timedOut).toBe(true);
  expect(result.error).toContain('timed out after 50ms');
});

// ─── classifyFailure ─────────────────────────────────────────────────

test('classifyFailure: rate limit / overload / network messages are transient', () => {
  expect(classifyFailure('Error: 429 Too Many Requests — rate limit exceeded')).toBe('transient');
  expect(classifyFailure('anthropic: overloaded_error: 529')).toBe('transient');
  expect(classifyFailure('503 Service Unavailable')).toBe('transient');
  expect(classifyFailure('ECONNRESET: socket hang up')).toBe('transient');
  expect(classifyFailure('Request timed out')).toBe('transient');
  expect(classifyFailure('quota exceeded')).toBe('transient');
  expect(classifyFailure('temporarily unavailable')).toBe('transient');
});

test('classifyFailure: auth / bad-request / unknown-model messages are permanent', () => {
  expect(classifyFailure('401 Unauthorized — invalid API key')).toBe('permanent');
  expect(classifyFailure('400 Bad Request: unsupported parameter')).toBe('permanent');
  expect(classifyFailure("Model 'foo/bar' is not available")).toBe('permanent');
  expect(classifyFailure('No API key found for undefined.')).toBe('permanent');
});

test('classifyFailure: a timed-out flag is always transient', () => {
  expect(classifyFailure('any message', true)).toBe('transient');
  expect(classifyFailure('permanent-looking message', true)).toBe('transient');
});

// ─── retryPrompt ─────────────────────────────────────────────────────

/** A fake persistent agent prompt. */
const fakePrompt = (
  behavior: (attempt: number) => Effect.Effect<AgentRunResult>,
): PersistentAgent['prompt'] => {
  let attempt = 0;
  return (_task, _timeoutMs, _onTool, _onDelta) => {
    const current = attempt++;
    return behavior(current);
  };
};

test('retryPrompt: retries transient failures with backoff then succeeds', async () => {
  const calls: string[] = [];
  const prompt = retryPrompt(
    fakePrompt((attempt) => {
      calls.push(`attempt-${attempt}`);
      if (attempt < 2) {
        return Effect.succeed({ text: '', error: '429 rate limit exceeded' });
      }
      return Effect.succeed({ text: 'ok', error: undefined });
    }),
    1000,
    { maxRetries: 3, baseDelayMs: 1 },
  );
  const result = await Effect.runPromise(prompt('task'));
  expect(result.error).toBeUndefined();
  expect(result.text).toBe('ok');
  // Two transient failures were retried (with sleeps), the third attempt won.
  expect(calls).toEqual(['attempt-0', 'attempt-1', 'attempt-2']);
});

test('retryPrompt: returns immediately on a timed-out turn (session is poisoned)', async () => {
  const prompt = retryPrompt(
    fakePrompt(() =>
      Effect.succeed({ text: '', error: 'timed out after 1000ms', timedOut: true }),
    ),
    1000,
    { maxRetries: 3, baseDelayMs: 1 },
  );
  const result = await Effect.runPromise(prompt('task'));
  expect(result.timedOut).toBe(true);
  expect(result.error).toContain('timed out');
});

test('retryPrompt: returns immediately on a permanent failure', async () => {
  const prompt = retryPrompt(
    fakePrompt(() => Effect.succeed({ text: '', error: '401 Unauthorized' })),
    1000,
    { maxRetries: 3, baseDelayMs: 1 },
  );
  const result = await Effect.runPromise(prompt('task'));
  expect(result.error).toBe('401 Unauthorized');
});

test('retryPrompt: maxRetries 0 does not retry', async () => {
  const prompt = retryPrompt(
    fakePrompt(() => Effect.succeed({ text: '', error: '429 rate limit' })),
    1000,
    { maxRetries: 0, baseDelayMs: 1 },
  );
  const result = await Effect.runPromise(prompt('task'));
  expect(result.error).toBe('429 rate limit');
});

// ─── runAgentResilient ───────────────────────────────────────────────

test('runAgentResilient: retries transient failures on the same model, then falls back', async () => {
  const calls: string[] = [];
  const base = (options: AgentRunOptions) => {
    calls.push(options.model);
    // Primary always rate-limits; the fallback model succeeds.
    return options.model === 'primary'
      ? Effect.succeed({ text: '', error: '529 overloaded' })
      : Effect.succeed({ text: 'fixed', error: undefined });
  };
  const result = await Effect.runPromise(
    runAgentResilient(
      base,
      ['primary', 'fallback-1'],
      (model) => ({ model, systemPrompt: '', task: 't', tools: [], cwd: '/tmp' }),
      1000,
      { maxRetries: 2, baseDelayMs: 1 },
    ),
  );
  expect(result.error).toBeUndefined();
  expect(result.text).toBe('fixed');
  // primary: initial attempt + 2 transient retries exhausted → fallback-1 wins.
  expect(calls).toEqual(['primary', 'primary', 'primary', 'fallback-1']);
});

test('runAgentResilient: all models failed → aggregated error naming every model', async () => {
  const result = await Effect.runPromise(
    runAgentResilient(
      (options: AgentRunOptions) =>
        Effect.succeed({
          text: '',
          error: `${options.model} exploded`,
        }),
      ['primary', 'fallback-1', 'fallback-2'],
      (model) => ({ model, systemPrompt: '', task: 't', tools: [], cwd: '/tmp' }),
      1000,
      { maxRetries: 0, baseDelayMs: 1 },
    ),
  );
  expect(result.error).toContain('All 3 model(s) failed');
  expect(result.error).toContain('primary: primary exploded');
  expect(result.error).toContain('fallback-1: fallback-1 exploded');
  expect(result.error).toContain('fallback-2: fallback-2 exploded');
});

test('runAgentResilient: permanent failure skips retries and falls back immediately', async () => {
  const calls: string[] = [];
  const base = (options: AgentRunOptions) => {
    calls.push(options.model);
    return options.model === 'primary'
      ? Effect.succeed({ text: '', error: '401 Unauthorized' })
      : Effect.succeed({ text: 'ok', error: undefined });
  };
  const result = await Effect.runPromise(
    runAgentResilient(
      base,
      ['primary', 'fallback-1'],
      (model) => ({ model, systemPrompt: '', task: 't', tools: [], cwd: '/tmp' }),
      1000,
      { maxRetries: 5, baseDelayMs: 1 },
    ),
  );
  expect(result.text).toBe('ok');
  // No retries for the permanent 401: exactly one primary call.
  expect(calls).toEqual(['primary', 'fallback-1']);
});

test('runAgentResilient: session-creation failure (error channel) falls back to the next model', async () => {
  const result = await Effect.runPromise(
    runAgentResilient(
      (options: AgentRunOptions) =>
        options.model === 'primary'
          ? Effect.fail(new AgentRunError({ message: 'Failed to create agent session (model: primary): 429 rate limit' }))
          : Effect.succeed({ text: 'ok', error: undefined }),
      ['primary', 'fallback-1'],
      (model) => ({ model, systemPrompt: '', task: 't', tools: [], cwd: '/tmp' }),
      1000,
      { maxRetries: 1, baseDelayMs: 1 },
    ),
  );
  expect(result.error).toBeUndefined();
  expect(result.text).toBe('ok');
});

test('runAgentResilient: empty model chain returns a clear failure', async () => {
  const result = await Effect.runPromise(
    runAgentResilient(
      () => Effect.succeed({ text: 'ok', error: undefined }),
      [],
      (model) => ({ model, systemPrompt: '', task: 't', tools: [], cwd: '/tmp' }),
      1000,
    ),
  );
  expect(result.error).toBe('No models configured for this agent role');
});

test('runAgentResilient: timedOut flag of the last failure is preserved', async () => {
  const result = await Effect.runPromise(
    runAgentResilient(
      () =>
        Effect.succeed({ text: '', error: 'timed out after 1000ms', timedOut: true }),
      ['primary'],
      (model) => ({ model, systemPrompt: '', task: 't', tools: [], cwd: '/tmp' }),
      1000,
      { maxRetries: 0, baseDelayMs: 1 },
    ),
  );
  expect(result.timedOut).toBe(true);
});
