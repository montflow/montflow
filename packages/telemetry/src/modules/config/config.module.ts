import { Option, Schema } from 'effect';
import type { JsonValue } from '../event/index.js';
import { file, trim } from '../path/index.js';
import { Fs } from '../platform/index.js';

/** The process environment slice the default store location needs. */
export interface Environment {
  readonly HOME: string;
  readonly XDG_DATA_HOME?: string;
}

/** Normalized plugin settings used by every telemetry module. */
export interface Settings {
  readonly directory: string;
  readonly retentionDays: number;
  readonly captureDeltas: boolean;
  readonly captureBodies: boolean;
}

/** Days of NDJSON history kept before `setup` prunes the rest. */
export const DEFAULT_RETENTION_DAYS = 30;

/** Upper bound for retention; keeps the date math inside the Date range. */
export const MAX_RETENTION_DAYS = 3650;

/** Optional `config.json` in the data directory, read by setup, CLI, and TUI. */
export interface FileConfig {
  readonly retentionDays?: number;
}

/** Plugin options as the host hands them over: an untyped record. */
export type RawOptions = Readonly<Record<string, JsonValue | undefined>>;

const decodeString = Schema.decodeUnknownOption(Schema.String);
const decodeNumber = Schema.decodeUnknownOption(Schema.Number);
const decodeBoolean = Schema.decodeUnknownOption(Schema.Boolean);
const FileConfig = Schema.Struct({ retentionDays: Schema.optional(Schema.Int) });
const decodeFileConfig = Schema.decodeUnknownOption(FileConfig);

/** `$XDG_DATA_HOME/opencode/telemetry`, else `$HOME/.local/share/opencode/telemetry`. */
export const defaultDirectory = (environment: Environment): string => {
  const xdg = environment.XDG_DATA_HOME;
  if (xdg !== undefined && xdg.length > 0) {
    return `${trim(xdg)}/opencode/telemetry`;
  }
  return `${trim(environment.HOME)}/.local/share/opencode/telemetry`;
};

/**
 * Read `retentionDays` from `config.json` in the data directory. This is the
 * shared knob for automatic pruning, the CLI, and the TUI command; a missing
 * or malformed file is simply ignored, just like a malformed option.
 */
export const retentionFromFile = (directory: string): number | undefined => {
  try {
    const text = Fs.readFileSync(file(directory, 'config.json'), 'utf8');
    const config = Option.getOrUndefined(decodeFileConfig(JSON.parse(text)));
    const value = config?.retentionDays;
    if (value === undefined || value < 0 || value > MAX_RETENTION_DAYS) return undefined;
    return value;
  } catch {
    return undefined;
  }
};

/**
 * Decode plugin options one key at a time so one malformed value cannot
 * discard the others. Invalid values fall back to their defaults: telemetry
 * configuration must never fail a session.
 */
export const resolve = (options: RawOptions, environment: Environment): Settings => {
  const directory = Option.getOrUndefined(decodeString(options['directory']));
  const retention = Option.getOrUndefined(decodeNumber(options['retentionDays']));
  return {
    directory:
      directory !== undefined && directory.length > 0
        ? trim(directory)
        : defaultDirectory(environment),
    retentionDays:
      retention !== undefined &&
      Number.isSafeInteger(retention) &&
      retention >= 0 &&
      retention <= MAX_RETENTION_DAYS
        ? retention
        : DEFAULT_RETENTION_DAYS,
    captureDeltas: Option.getOrUndefined(decodeBoolean(options['captureDeltas'])) ?? false,
    captureBodies: Option.getOrUndefined(decodeBoolean(options['captureBodies'])) ?? false,
  };
};
