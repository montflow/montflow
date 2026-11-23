import * as Vitest from '@effect/vitest';
import * as Roles from '../index.js';

/** Plain JSON, for hand-built (and deliberately invalid) files. */
type Json =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<Json>
  | { readonly [key: string]: Json };

const FILE = (roles: { readonly [role: string]: Json }): string =>
  JSON.stringify({ version: 1, roles });

const paths = (raw: string): ReadonlyArray<string> =>
  Roles.decode(raw)
    .issues.filter((issue) => issue.severity === 'error')
    .map((issue) => issue.path);

Vitest.describe('decode', () => {
  Vitest.it('accepts a valid file', () => {
    const decoded = Roles.decode(
      FILE({
        'bug-fix': [
          [
            { harness: 'claude-code', model: 'opus', effort: 'xhigh' },
            { harness: 'codex', model: 'gpt-5.5', effort: 'high' },
          ],
        ],
        'interrogate-reviewers': [
          [{ harness: 'claude-code', model: 'fable' }],
          [{ harness: 'opencode', model: 'google/gemini-4-neon', effort: 'max' }],
          [{ harness: 'pi', model: 'anthropic/claude-sonnet-5', effort: 'high' }],
        ],
      }),
    );
    Vitest.expect(decoded.issues).toEqual([]);
    Vitest.expect(decoded.file?.roles['bug-fix']?.[0]?.[1]?.model).toBe('gpt-5.5');
  });

  Vitest.it('reports every structural issue with a 1-based path', () => {
    Vitest.expect(paths(FILE({ feature: [[{ harness: 'cursor', model: '', extra: 1 }]] }))).toEqual(
      ['roles.feature[1][1].extra', 'roles.feature[1][1].harness', 'roles.feature[1][1].model'],
    );
    Vitest.expect(paths('{')).toEqual(['$']);
    Vitest.expect(paths(JSON.stringify({ version: 2, roles: {} }))).toEqual(['version']);
  });

  Vitest.it('rejects a model its harness does not run', () => {
    Vitest.expect(paths(FILE({ feature: [[{ harness: 'codex', model: 'fable' }]] }))).toEqual([
      'roles.feature[1][1].model',
    ]);
    Vitest.expect(
      paths(FILE({ feature: [[{ harness: 'claude-code', model: 'gpt-5.5' }]] })),
    ).toEqual(['roles.feature[1][1].model']);
    Vitest.expect(paths(FILE({ feature: [[{ harness: 'opencode', model: 'gpt-5.5' }]] }))).toEqual([
      'roles.feature[1][1].model',
    ]);
    Vitest.expect(
      paths(FILE({ feature: [[{ harness: 'claude-code', model: 'claude-opus-5-5[1m]' }]] })),
    ).toEqual([]);
  });

  Vitest.it('rejects an effort its harness does not take', () => {
    Vitest.expect(
      paths(FILE({ feature: [[{ harness: 'codex', model: 'gpt-5.5', effort: 'max' }]] })),
    ).toEqual(['roles.feature[1][1].effort']);
    Vitest.expect(
      paths(FILE({ feature: [[{ harness: 'claude-code', model: 'opus', effort: 'minimal' }]] })),
    ).toEqual(['roles.feature[1][1].effort']);
  });

  Vitest.it('rejects unknown roles, empty seats, and several seats outside a panel', () => {
    Vitest.expect(paths(FILE({ nope: [[{ harness: 'codex', model: 'gpt-5.5' }]] }))).toEqual([
      'roles.nope',
    ]);
    Vitest.expect(paths(FILE({ feature: [] }))).toEqual(['roles.feature']);
    Vitest.expect(paths(FILE({ feature: [[]] }))).toEqual(['roles.feature[1]']);
    const seat = [{ harness: 'codex', model: 'gpt-5.5' }];
    Vitest.expect(paths(FILE({ feature: [seat, seat] }))).toEqual(['roles.feature']);
    Vitest.expect(paths(FILE({ 'arena-runners': [seat, seat] }))).toEqual([]);
  });

  Vitest.it('warns on a harness repeated within one seat', () => {
    const decoded = Roles.decode(
      FILE({
        feature: [
          [
            { harness: 'codex', model: 'gpt-5.5' },
            { harness: 'codex', model: 'gpt-5.4' },
          ],
        ],
      }),
    );
    Vitest.expect(decoded.file).toBeDefined();
    Vitest.expect(decoded.issues.map((issue) => issue.severity)).toEqual(['warning']);
  });
});

Vitest.describe('specs', () => {
  Vitest.it('splits the effort only when the last segment is an effort word', () => {
    Vitest.expect(Roles.parseCandidate('claude-code:opus:xhigh')).toEqual({
      ok: true,
      value: { harness: 'claude-code', model: 'opus', effort: 'xhigh' },
    });
    Vitest.expect(Roles.parseCandidate('opencode:ollama/qwen:7b')).toEqual({
      ok: true,
      value: { harness: 'opencode', model: 'ollama/qwen:7b' },
    });
    Vitest.expect(Roles.parseCandidate('cursor:x').ok).toBe(false);
    Vitest.expect(Roles.parseCandidate('codex:').ok).toBe(false);
  });

  Vitest.it('round-trips a seat', () => {
    const spec = 'claude-code:opus:xhigh,codex:gpt-5.5:high,opencode:openai/gpt-5.5';
    const seat = Roles.parseSeat(spec);
    Vitest.expect(seat.ok && Roles.formatSeat(seat.value)).toBe(spec);
  });

  Vitest.it('sets and unsets a role', () => {
    const seat = [{ harness: 'codex' as const, model: 'gpt-5.5' }];
    const file = Roles.setRole(Roles.EMPTY, 'feature', [seat]);
    Vitest.expect(file.roles['feature']).toEqual([seat]);
    Vitest.expect(Roles.unsetRole(file, 'feature').roles).toEqual({});
  });
});

Vitest.describe('resolve', () => {
  const file = Roles.setRole(Roles.EMPTY, 'interrogate-reviewers', [
    [{ harness: 'claude-code', model: 'fable', effort: 'high' }],
    [
      { harness: 'pi', model: 'openai/gpt-5.5' },
      { harness: 'codex', model: 'gpt-5.5' },
    ],
    [{ harness: 'pi', model: 'google/gemini-4-neon' }],
  ]);

  Vitest.it('runs the current harness natively, dispatches installed ones, drops the rest', () => {
    const resolution = Roles.resolve(
      file,
      'interrogate-reviewers',
      'claude-code',
      (harness) => harness === 'codex',
    );
    Vitest.expect(resolution.source).toBe('set');
    Vitest.expect(resolution.seats.map((seat) => seat.run)).toEqual([
      'native',
      'dispatch',
      'dropped',
    ]);
    Vitest.expect(resolution.seats[1]?.candidate?.harness).toBe('codex');
    Vitest.expect(resolution.seats[1]?.skipped.map((entry) => entry.reason)).toEqual([
      'pi not installed',
    ]);
  });

  Vitest.it('prefers the first available candidate even over the current harness', () => {
    const resolution = Roles.resolve(file, 'interrogate-reviewers', 'codex', () => true);
    Vitest.expect(resolution.seats.map((seat) => `${seat.run}:${seat.candidate?.harness}`)).toEqual(
      ['dispatch:claude-code', 'dispatch:pi', 'dispatch:pi'],
    );
  });

  Vitest.it('an unset role is one native default seat', () => {
    const resolution = Roles.resolve(file, 'feature', 'opencode', () => false);
    Vitest.expect(resolution).toEqual({
      role: 'feature',
      source: 'default',
      current: 'opencode',
      seats: [{ seat: 1, run: 'native', skipped: [] }],
    });
  });
});

Vitest.describe('detectHarness', () => {
  Vitest.it('reads the harness markers', () => {
    Vitest.expect(Roles.detectHarness({ CLAUDECODE: '1' })).toEqual({
      ok: true,
      value: 'claude-code',
    });
    Vitest.expect(Roles.detectHarness({ CODEX_THREAD_ID: 'x' })).toEqual({
      ok: true,
      value: 'codex',
    });
    Vitest.expect(Roles.detectHarness({ OPENCODE: '1' })).toEqual({ ok: true, value: 'opencode' });
  });

  Vitest.it('lets MF_MODE_HARNESS settle a nested session', () => {
    Vitest.expect(Roles.detectHarness({ CLAUDECODE: '1', CODEX_THREAD_ID: 'x' }).ok).toBe(false);
    Vitest.expect(
      Roles.detectHarness({ CLAUDECODE: '1', CODEX_THREAD_ID: 'x', MF_MODE_HARNESS: 'codex' }),
    ).toEqual({ ok: true, value: 'codex' });
    Vitest.expect(Roles.detectHarness({ MF_MODE_HARNESS: 'cursor' }).ok).toBe(false);
  });

  Vitest.it('refuses to guess with no markers', () => {
    Vitest.expect(Roles.detectHarness({})).toEqual({
      ok: false,
      reason: 'Cannot tell which harness this is.',
    });
  });
});
