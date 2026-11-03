import { Effect, Schema, Result } from 'effect';
import {
  type DoctorError,
  type DoctorOptions as PayloadDoctorOptions,
  type PayloadDoctorResult,
  type PayloadEntry,
  type PayloadInstall,
  type DoctorCode,
  nameAt,
  resolveRepoRoot,
  runPayloadDoctor,
  loadManifest,
  repairableStatus,
} from '@montflow/payload';
import { EMBEDDED_PAYLOAD } from './embedded-payload.generated.js';
import manifestJson from '../../../payload.json' with { type: 'json' };

/**
 * `mf-specs doctor` — check `<root>/.agents/skills/` and
 * `<root>/.agents/@montflow/prompts/` against the artifacts this package
 * ships, and repair what it can.
 *
 * The manifest is the source of truth: this module only contributes the spec
 * prompt validator on top of the shared compare/install engine.
 */

/** The validated manifest this package ships. */
export const MANIFEST = loadManifest(manifestJson, '@montflow/specs');

/** Skills shipped with the package and installed into a repo. */
export const SPEC_SKILL_NAMES = [
  nameAt(MANIFEST, 'skill', 0),
  nameAt(MANIFEST, 'skill', 1),
] as const;

/** The spec-creation skill name. */
export const CREATE_SPEC_SKILL_NAME = nameAt(MANIFEST, 'skill', 0);

/** The spec-discovery skill name. */
export const FIND_SPECS_SKILL_NAME = nameAt(MANIFEST, 'skill', 1);

/** Prompts shipped with the package and installed into a repo. */
export const SPEC_PROMPT_NAMES = [
  nameAt(MANIFEST, 'prompt', 0),
  nameAt(MANIFEST, 'prompt', 1),
  nameAt(MANIFEST, 'prompt', 2),
] as const;

export type { DoctorCode, DoctorError, PayloadInstall };

/** Outcome for one shipped skill. */
export type SkillInstall = PayloadInstall;

/** Outcome for one shipped prompt file. */
export type PromptInstall = PayloadInstall;

/** Outcome of a doctor run across every shipped skill and prompt. */
export type DoctorResult = PayloadDoctorResult;

/** How to run: copy missing payloads in and refresh drifted ones, or only report. */
export interface DoctorOptions {
  /** Report only — never write. */
  readonly check?: boolean;
}

/** Package root, three levels up from `src/modules/doctor`. */
export const packageRoot = `${import.meta.dirname}/../../..`;

/** Schema doctor requires a canonical prompt file to decode as. */
const PromptFile = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.String,
    description: Schema.String,
    template: Schema.String,
    variables: Schema.Array(Schema.Unknown),
    skills: Schema.Array(Schema.String),
    model: Schema.String,
  }),
);

/** Lowercase, hyphen-separated prompt slug. */
const PROMPT_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Decode and check one prompt file before it is copied anywhere.
 * @param name - expected prompt name (the file stem)
 * @param text - raw JSON bytes
 * @returns undefined when valid, else a problem sentence starting with a verb
 */
export const promptProblem = (name: string, text: string): Effect.Effect<string | undefined> =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknownEffect(PromptFile)(text).pipe(Effect.result);
    if (Result.isFailure(decoded)) {
      return `is not valid prompt JSON (${decoded.failure.message})`;
    }
    const prompt = decoded.success;
    if (prompt.name !== name) {
      return `declares name '${prompt.name}', expected '${name}'`;
    }
    if (!PROMPT_NAME_PATTERN.test(prompt.name)) {
      return `uses a non-slug name '${prompt.name}'`;
    }
    if (prompt.description.trim() === '') return 'has an empty "description"';
    if (prompt.template.trim() === '') return 'has an empty "template"';
    return undefined;
  });

/** The shared engine's prompt validator, run synchronously. */
const validatePrompt = (entry: PayloadEntry, text: string): string | undefined =>
  entry.kind === 'prompt' ? promptProblem(entry.name, text).pipe(Effect.runSync) : undefined;

/**
 * Check every packaged skill and prompt under `<root>`. In repair mode missing
 * payloads are written and stale or partial ones are rewritten; in check mode
 * nothing is written. One payload's failure never aborts the others.
 * @param root - repo root that owns `.agents/`
 * @param options - set `check` to report without writing
 * @returns one outcome per skill and prompt plus the aggregate status
 */
export const runDoctor = (root: string, options: DoctorOptions = {}): Effect.Effect<DoctorResult> =>
  runPayloadDoctor(root, MANIFEST, {
    check: options.check === true,
    packageRoot,
    embedded: EMBEDDED_PAYLOAD,
    invocation: 'mf-specs doctor',
    subject: 'spec skills and prompts',
    validate: validatePrompt,
  } satisfies PayloadDoctorOptions);

/** Re-exported so the CLI can keep its exact repair-hint rule. */
export { repairableStatus, resolveRepoRoot };

/**
 * Resolve the repo root from `startDir`, then check/install the payloads there.
 * @param startDir - directory to resolve the repo root from
 * @param options - set `check` to report without writing
 * @returns one outcome per skill and prompt plus the aggregate status
 */
export const runDoctorAt = (
  startDir: string,
  options: DoctorOptions = {},
): Effect.Effect<DoctorResult> =>
  resolveRepoRoot(startDir).pipe(Effect.flatMap((root) => runDoctor(root, options)));
