import * as Vitest from '@effect/vitest';
import * as DataPort from '../index.js';

const sessions: ReadonlyArray<DataPort.SessionSnapshot> = [
  { id: 'ses_1', title: 'First' },
  { id: 'ses_2' },
];

const makeContext = (): DataPort.DataContext => ({
  data: {
    session: {
      list: () => sessions,
      get: (sessionID) => sessions.find((session) => session.id === sessionID),
      status: (sessionID) => (sessionID === 'ses_2' ? 'running' : 'idle'),
    },
    location: {
      vcs: {
        info: () => ({ branch: 'feat/opencode-migration' }),
      },
    },
  },
});

Vitest.describe('DataPort runtime', () => {
  Vitest.it('sessions and session project the host list', () => {
    const port = DataPort.makeDataPort(makeContext());
    Vitest.expect(port.sessions()).toBe(sessions);
    Vitest.expect(port.session('ses_1')?.title).toBe('First');
    Vitest.expect(port.session('missing')).toBeUndefined();
  });

  Vitest.it('status and vcs read the host data layer', () => {
    const port = DataPort.makeDataPort(makeContext());
    Vitest.expect(port.status('ses_2')).toBe('running');
    Vitest.expect(port.status('ses_1')).toBe('idle');
    Vitest.expect(port.vcs()).toStrictEqual({ branch: 'feat/opencode-migration' });
  });

  Vitest.it('degrades to an empty read without a TUI context', () => {
    const port = DataPort.makeDataPort({});
    Vitest.expect(port.sessions()).toStrictEqual([]);
    Vitest.expect(port.session('ses_1')).toBeUndefined();
    Vitest.expect(port.status('ses_1')).toBe('unknown');
    Vitest.expect(port.vcs()).toBeUndefined();
  });
});
