import { Prompts } from '@montflow/prompts';
import { Effect } from 'effect';
// eslint-disable-next-line montflow/no-node-platform-imports -- doctor installs artifacts into the workspace, outside an Effect platform layer.
import { existsSync } from 'node:fs';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above.
import { dirname, join, resolve } from 'node:path';
import { EMBEDDED_PROMPT_PAYLOAD } from './embedded-payload.generated.js';

/** Prompt templates this package ships and installs into `.agents/@montflow/pi-prompts`. */
export const PROMPT_NAMES = ['model-fallback'] as const;

/** Directory of the package's readable prompt sources. Absent in a compiled binary. */
export const shippedPromptsDir = (): string =>
  join(resolve(import.meta.dirname, '..', '..', '..'), 'prompts');

/** Directory `doctor` installs prompt templates into. */
export const installedPromptsDir = (root: string): string =>
  join(root, '.agents', '@montflow', 'pi-prompts');

/** Where one installed prompt lives. */
export const installedPrompt = (root: string, name: string): string =>
  join(installedPromptsDir(root), `${name}.json`);

/** How one shipped artifact compares to the workspace copy. */
export interface ArtifactStatus {
  readonly name: string;
  /**
   * `ok` — installed and byte-identical.
   * `missing` — not installed.
   * `stale` — installed, but the contents differ.
   * `installed` / `repaired` — doctor wrote or rewrote the copy.
   * `invalid` — the packaged template fails verification; nothing was written.
   */
  readonly status: 'ok' | 'missing' | 'stale' | 'installed' | 'repaired' | 'invalid';
  readonly target: string;
  readonly detail: string;
}

/** Outcome of one doctor run. */
export interface DoctorResult {
  readonly status: 'ok' | 'repaired' | 'drifted' | 'invalid';
  /** True when every artifact is installed, current, and valid. */
  readonly healthy: boolean;
  readonly artifacts: ReadonlyArray<ArtifactStatus>;
  readonly message: string;
}

/** Report only, or repair what is stale. */
export interface DoctorOptions {
  readonly check?: boolean;
  readonly invocation?: string | undefined;
}

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const readIfPresent = (file: string): Effect.Effect<string | undefined> =>
  Effect.tryPromise(() => readFile(file, 'utf8')).pipe(Effect.orElseSucceed(() => undefined));

/** The packaged template: the checkout file when present, else the embedded copy. */
const readPayload = (name: string): Effect.Effect<string | undefined> =>
  Effect.gen(function* () {
    const fromPackage = yield* readIfPresent(join(shippedPromptsDir(), `${name}.json`));
    return fromPackage ?? EMBEDDED_PROMPT_PAYLOAD[name];
  });

const doctorOne = (
  root: string,
  name: string,
  options: DoctorOptions,
): Effect.Effect<ArtifactStatus, string> =>
  Effect.gen(function* () {
    const target = installedPrompt(root, name);
    const payload = yield* readPayload(name);
    if (payload === undefined) {
      return yield* Effect.fail(`'${name}' is not packaged with this build.`);
    }
    const verified = Prompts.verifyPromptFile(name, payload);
    if (!verified.valid) {
      return {
        name,
        status: 'invalid' as const,
        target,
        detail: Prompts.verifyReport(name, verified),
      };
    }
    const installed = yield* readIfPresent(target);
    if (installed === payload) {
      return { name, status: 'ok' as const, target, detail: 'installed and current' };
    }
    const status = installed === undefined ? ('missing' as const) : ('stale' as const);
    if (options.check === true) {
      return {
        name,
        status,
        target,
        detail: installed === undefined ? 'not installed' : 'differs from the packaged template',
      };
    }
    yield* Effect.tryPromise({
      try: async () => {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, payload, 'utf8');
      },
      catch: (cause) => `Could not write ${target}: ${reasonOf(cause)}`,
    });
    return {
      name,
      status: installed === undefined ? ('installed' as const) : ('repaired' as const),
      target,
      detail: `wrote ${payload.length} bytes`,
    };
  });

/**
 * Install or check this package's prompt templates. `check` never writes and
 * exits non-zero when anything is missing, stale, or invalid.
 */
export const run = (
  root: string,
  options: DoctorOptions = {},
): Effect.Effect<DoctorResult, string> =>
  Effect.gen(function* () {
    if (!existsSync(root)) {
      return yield* Effect.fail(`Workspace root not found: ${root}`);
    }
    const artifacts = yield* Effect.forEach(PROMPT_NAMES, (name) => doctorOne(root, name, options));
    const invalid = artifacts.some((artifact) => artifact.status === 'invalid');
    const needsFix = artifacts.some(
      (artifact) =>
        artifact.status === 'missing' ||
        artifact.status === 'stale' ||
        artifact.status === 'invalid',
    );
    const repaired = artifacts.some(
      (artifact) => artifact.status === 'installed' || artifact.status === 'repaired',
    );
    const status = invalid ? 'invalid' : repaired ? 'repaired' : needsFix ? 'drifted' : 'ok';
    const invocation = options.invocation ?? 'mf-model-fallback doctor';
    const message = invalid
      ? `A packaged prompt template failed verification. Fix it in packages/model-fallback/prompts/.`
      : needsFix
        ? `Run \`${invocation}\` to install the packaged prompt templates.`
        : repaired
          ? `Installed prompt templates under ${installedPromptsDir(root)}.`
          : `Prompt templates are installed and current under ${installedPromptsDir(root)}.`;
    return { status, healthy: !needsFix, artifacts, message };
  });
