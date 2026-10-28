import * as Vitest from '@effect/vitest';
import * as Config from '../index.js';

const environment = { HOME: '/home/tester' };

Vitest.describe('Config.resolve runtime', () => {
  Vitest.it('uses $XDG_DATA_HOME/opencode/telemetry when set', () => {
    const settings = Config.resolve({}, { HOME: '/home/tester', XDG_DATA_HOME: '/data' });
    Vitest.expect(settings.directory).toBe('/data/opencode/telemetry');
  });

  Vitest.it('falls back to $HOME/.local/share/opencode/telemetry', () => {
    Vitest.expect(Config.defaultDirectory(environment)).toBe(
      '/home/tester/.local/share/opencode/telemetry',
    );
    Vitest.expect(Config.resolve({}, environment).directory).toBe(
      '/home/tester/.local/share/opencode/telemetry',
    );
  });

  Vitest.it('applies capture and retention defaults', () => {
    Vitest.expect(Config.resolve({}, environment)).toStrictEqual({
      directory: '/home/tester/.local/share/opencode/telemetry',
      retentionDays: Config.DEFAULT_RETENTION_DAYS,
      captureDeltas: false,
      captureBodies: false,
    });
  });

  Vitest.it('honors every plugin override', () => {
    Vitest.expect(
      Config.resolve(
        {
          directory: '/tmp/telemetry-tests',
          retentionDays: 7,
          captureDeltas: true,
          captureBodies: true,
        },
        environment,
      ),
    ).toStrictEqual({
      directory: '/tmp/telemetry-tests',
      retentionDays: 7,
      captureDeltas: true,
      captureBodies: true,
    });
  });

  Vitest.it('falls back to defaults on a malformed options record', () => {
    const malformed: Config.RawOptions = JSON.parse('{"retentionDays":"thirty"}');
    Vitest.expect(Config.resolve(malformed, environment)).toStrictEqual({
      directory: '/home/tester/.local/share/opencode/telemetry',
      retentionDays: Config.DEFAULT_RETENTION_DAYS,
      captureDeltas: false,
      captureBodies: false,
    });
  });
});
