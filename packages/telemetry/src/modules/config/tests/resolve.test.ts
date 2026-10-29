import * as Vitest from '@effect/vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Config from '../index.js';

const environment = { HOME: '/home/tester' };

const withDirectory = (run: (directory: string) => void): void => {
  const directory = mkdtempSync(join(tmpdir(), 'telemetry-config-'));
  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

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

  Vitest.it('keeps valid options when one value is malformed', () => {
    const malformed: Config.RawOptions = JSON.parse(
      '{"directory":"/tmp/telemetry-tests","retentionDays":"thirty","captureDeltas":"yes"}',
    );
    Vitest.expect(Config.resolve(malformed, environment)).toStrictEqual({
      directory: '/tmp/telemetry-tests',
      retentionDays: Config.DEFAULT_RETENTION_DAYS,
      captureDeltas: false,
      captureBodies: false,
    });
  });

  Vitest.it('reads retentionDays from config.json and ignores invalid files', () => {
    withDirectory((directory) => {
      Vitest.expect(Config.retentionFromFile(directory)).toBeUndefined();
      writeFileSync(join(directory, 'config.json'), '{"retentionDays":14}');
      Vitest.expect(Config.retentionFromFile(directory)).toBe(14);
      writeFileSync(join(directory, 'config.json'), '{"retentionDays":"soon"}');
      Vitest.expect(Config.retentionFromFile(directory)).toBeUndefined();
      writeFileSync(join(directory, 'config.json'), '{"retentionDays":-1}');
      Vitest.expect(Config.retentionFromFile(directory)).toBeUndefined();
      writeFileSync(join(directory, 'config.json'), 'not json');
      Vitest.expect(Config.retentionFromFile(directory)).toBeUndefined();
    });
  });

  Vitest.it('rejects negative, infinite, and fractional retention windows', () => {
    for (const retentionDays of [-5, Number.POSITIVE_INFINITY, Number.NaN, 1.5, 1e10]) {
      Vitest.expect(Config.resolve({ retentionDays }, environment).retentionDays).toBe(
        Config.DEFAULT_RETENTION_DAYS,
      );
    }
    Vitest.expect(Config.resolve({ retentionDays: 0 }, environment).retentionDays).toBe(0);
    Vitest.expect(Config.resolve({ retentionDays: 30 }, environment).retentionDays).toBe(30);
  });
});
