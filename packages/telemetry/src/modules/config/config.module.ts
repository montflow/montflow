import { Option, Schema } from 'effect';
import type { JsonValue } from '../event/index.js';

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

/** Matches the host's untyped plugin options; decoding narrows it. */
const Raw = Schema.Struct({
  directory: Schema.optional(Schema.String),
  retentionDays: Schema.optional(Schema.Number),
  captureDeltas: Schema.optional(Schema.Boolean),
  captureBodies: Schema.optional(Schema.Boolean),
});

const decode = Schema.decodeUnknownOption(Raw);

const stripTrailingSlashes = (value: string): string => value.replace(/\/+$/u, '');

/** `$XDG_DATA_HOME/opencode/telemetry`, else `$HOME/.local/share/opencode/telemetry`. */
export const defaultDirectory = (environment: Environment): string => {
  const xdg = environment.XDG_DATA_HOME;
  if (xdg !== undefined && xdg.length > 0) {
    return `${stripTrailingSlashes(xdg)}/opencode/telemetry`;
  }
  return `${stripTrailingSlashes(environment.HOME)}/.local/share/opencode/telemetry`;
};

/** Plugin options as the host hands them over: an untyped record. */
export type RawOptions = Readonly<Record<string, JsonValue | undefined>>;

/**
 * Decode plugin options over the defaults. Invalid option shapes fall back to
 * the defaults wholesale: telemetry configuration must never fail a session.
 */
export const resolve = (options: RawOptions, environment: Environment): Settings => {
  const raw: Schema.Schema.Type<typeof Raw> = Option.getOrUndefined(decode(options)) ?? {};
  return {
    directory: raw.directory ?? defaultDirectory(environment),
    retentionDays: raw.retentionDays ?? DEFAULT_RETENTION_DAYS,
    captureDeltas: raw.captureDeltas ?? false,
    captureBodies: raw.captureBodies ?? false,
  };
};
