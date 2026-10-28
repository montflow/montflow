import { Console, Effect, Option } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import * as Engines from './engines.apps.module.js';
import * as Renderers from './renderers.apps.module.js';

/**
 * The `mf-model-fallback` command tree. Every handler is an engine plus a
 * renderer, so the binary and any slash-command front end cannot disagree
 * about behaviour.
 */

export const VERSION = '0.0.1';

const opt = (value: Option.Option<string>): string | undefined => Option.getOrUndefined(value);

const optionalString = (name: string, description: string) =>
  Flag.string(name).pipe(Flag.withDescription(description), Flag.optional);

const optionalBoolean = (name: string, description: string) =>
  Flag.boolean(name).pipe(Flag.withDescription(description), Flag.withDefault(false));

const dirFlag = optionalString('dir', 'Workspace root. Defaults to the working directory.');
const serverFlag = optionalString(
  'server',
  'OpenCode server URL. Defaults to the discovered local service.',
);
const jsonFlag = optionalBoolean('json', 'Print the result as JSON.');

/** Mark the process failed without failing the handler, so stdout flushes. */
const exitFailed = Effect.sync(() => {
  process.exitCode = 1;
});

const report = <A, R>(
  self: Effect.Effect<A, string, R>,
  render: (value: A) => string,
  json: boolean,
): Effect.Effect<void, never, R> =>
  self.pipe(
    Effect.matchEffect({
      onFailure: (message) => Console.log(message).pipe(Effect.andThen(exitFailed)),
      onSuccess: (value) => Console.log(json ? JSON.stringify(value, null, 2) : render(value)),
    }),
  );

const scopeOf = (dir: Option.Option<string>, server: Option.Option<string>): Engines.Scope => {
  const cwd = opt(dir) ?? process.cwd();
  const url = opt(server);
  return url === undefined ? { cwd } : { cwd, server: url };
};

const showCommand = Command.make('show', { dir: dirFlag, json: jsonFlag }, (config) =>
  report(Engines.show(scopeOf(config.dir, Option.none())), Renderers.show, config.json),
);

const modelsCommand = Command.make(
  'models',
  {
    dir: dirFlag,
    server: serverFlag,
    json: jsonFlag,
    limit: Flag.integer('limit').pipe(
      Flag.withDescription('Maximum models to list. Defaults to 20.'),
      Flag.withDefault(20),
    ),
  },
  (config) =>
    report(
      Engines.models(scopeOf(config.dir, config.server), config.limit),
      Renderers.models,
      config.json,
    ),
);

const setCommand = Command.make(
  'set',
  {
    chain: Flag.string('chain').pipe(
      Flag.withDescription('Comma-separated chain: <provider/model>[,<provider/model>...].'),
    ),
    trigger: optionalString(
      'trigger',
      'Comma-separated triggers. Defaults to quota,rate-limit,auth.',
    ),
    allowUnknown: optionalBoolean('allow-unknown', 'Write models the live catalog does not list.'),
    dir: dirFlag,
    server: serverFlag,
    json: jsonFlag,
  },
  (config) =>
    report(
      Engines.set(scopeOf(config.dir, config.server), {
        chain: config.chain
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry !== ''),
        triggers:
          opt(config.trigger) === undefined
            ? undefined
            : (opt(config.trigger) ?? '')
                .split(',')
                .map((entry) => entry.trim())
                .filter((entry) => entry !== ''),
        allowUnknown: config.allowUnknown,
      }),
      Renderers.set,
      config.json,
    ),
);

const verifyCommand = Command.make(
  'verify',
  { dir: dirFlag, server: serverFlag, json: jsonFlag },
  (config) =>
    report(Engines.verify(scopeOf(config.dir, config.server)), Renderers.verify, config.json),
);

const doctorCommand = Command.make(
  'doctor',
  { check: optionalBoolean('check', 'Report only; never write.'), dir: dirFlag, json: jsonFlag },
  (config) =>
    Effect.gen(function* () {
      const result = yield* Engines.doctor(scopeOf(config.dir, Option.none()), config.check);
      yield* Console.log(config.json ? JSON.stringify(result, null, 2) : Renderers.doctor(result));
      if (!result.healthy) yield* exitFailed;
    }).pipe(
      Effect.catch((message) =>
        Console.log(message).pipe(Effect.andThen(exitFailed), Effect.asVoid),
      ),
    ),
);

const removeCommand = Command.make('remove', { dir: dirFlag, json: jsonFlag }, (config) =>
  report(Engines.remove(scopeOf(config.dir, Option.none())), Renderers.remove, config.json),
);

export const rootCommand = Command.make('mf-model-fallback').pipe(
  Command.withDescription(
    'Show, set, and verify model fallback chains for this workspace, and install the packaged prompt.',
  ),
  Command.withSubcommands([
    showCommand,
    modelsCommand,
    setCommand,
    verifyCommand,
    doctorCommand,
    removeCommand,
  ]),
);
