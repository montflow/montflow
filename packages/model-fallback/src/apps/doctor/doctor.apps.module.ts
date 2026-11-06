import { Prompts } from '@montflow/prompts';
import { Effect } from 'effect';
import {
  type LoadedManifest,
  type PayloadEntry,
  type PayloadInstall,
  loadManifest,
  nameAt,
  runPayloadDoctor,
} from '@montflow/payload';
// eslint-disable-next-line montflow/no-node-platform-imports -- doctor installs artifacts into the workspace, outside an Effect platform layer.
import { existsSync } from 'node:fs';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above.
import { join, resolve } from 'node:path';
import { EMBEDDED_PAYLOAD } from './embedded-payload.generated.js';
import manifestJson from '../../../payload.json' with { type: 'json' };

/** Prompt templates this package ships and installs into the prompts store. */
export const MANIFEST: LoadedManifest = loadManifest(manifestJson, '@montflow/model-fallback');

/** Prompt templates this package ships and installs into the prompts store. */
export const PROMPT_NAMES = [nameAt(MANIFEST, 'prompt', 0)] as const;

/** Directory of the package's readable prompt sources. Absent in a compiled binary. */
export const shippedPromptsDir = (): string =>
  join(resolve(import.meta.dirname, '..', '..', '..'), 'prompts');

/** Directory `doctor` installs prompt templates into. */
export const installedPromptsDir = (root: string): string => join(root, ...Prompts.STORE_SEGMENTS);

/** Where one installed prompt lives. */
export const installedPrompt = (root: string, name: string): string =>
  join(installedPromptsDir(root), `${name}.json`);

/** How one shipped artifact compares to the workspace copy. */
export type ArtifactStatus = PayloadInstall;

/** Outcome of one doctor run. */
export interface DoctorResult {
  readonly status: 'ok' | 'present' | 'installed' | 'drifted';
  readonly healthy: boolean;
  readonly artifacts: ReadonlyArray<PayloadInstall>;
  readonly message: string;
}

/** Report only, or repair what is stale. */
export interface DoctorOptions {
  readonly check?: boolean;
  readonly invocation?: string | undefined;
}

/** Validate one packaged prompt template before it is installed. */
const validatePrompt = (entry: PayloadEntry, text: string): string | undefined => {
  const verified = Prompts.verifyPromptFile(entry.name, text);
  return verified.valid ? undefined : Prompts.verifyReport(entry.name, verified);
};

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
    const result = yield* runPayloadDoctor(root, MANIFEST, {
      check: options.check === true,
      packageRoot: `${import.meta.dirname}/../../..`,
      embedded: EMBEDDED_PAYLOAD,
      invocation: options.invocation ?? 'mf-model-fallback doctor',
      subject: 'prompt templates',
      validate: validatePrompt,
    });
    return {
      status: result.status,
      healthy: result.healthy,
      artifacts: result.payloads,
      message: result.message,
    };
  });
