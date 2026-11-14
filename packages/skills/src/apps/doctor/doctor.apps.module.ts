import { Effect, FileSystem, Path } from 'effect';
import {
  type LoadedManifest,
  type PayloadEntry,
  type PayloadFiles,
  type PayloadInstall,
  type PayloadDoctorResult,
  loadManifest,
  nameAt,
  resolvePayload as resolveSharedPayload,
  runPayloadDoctor,
  type EmbeddedPayload,
} from '@montflow/payload';
import { EMBEDDED_PAYLOAD } from './embedded-payload.generated.js';
import manifestJson from '../../../payload.json' with { type: 'json' };

/**
 * `mf-skills doctor` — the binary, and the `/mf-skills` slash command of the
 * same name: check `<root>/.agents/skills/` against the skills this package
 * ships, and repair what it can.
 *
 * The manifest owns the skill list and the shared engine owns compare/install;
 * this module only names the package's roots and invocation.
 */

/** The validated manifest this package ships. */
export const MANIFEST: LoadedManifest = loadManifest(manifestJson, '@montflow/skills');

/** Skills shipped with the package and installed into a repo. */
export const SKILL_NAMES = [nameAt(MANIFEST, 'skill', 0), nameAt(MANIFEST, 'skill', 1)] as const;

/** The default way a caller reaches `doctor` when it does not say. */
export const DEFAULT_DOCTOR_INVOCATION = '/mf-skills doctor';

/** A skill's packaged files, as filename → contents. */
export type SkillPayload = PayloadFiles;

/** Where a resolved payload came from. */
export type PayloadOrigin = 'package' | 'embedded';

/** Outcome for one shipped skill. */
export type SkillStatus = PayloadInstall;

/** Outcome of a doctor run across every shipped skill. */
export interface DoctorResult {
  readonly status: PayloadDoctorResult['status'];
  readonly healthy: boolean;
  readonly skills: ReadonlyArray<PayloadInstall>;
  readonly message: string;
}

/** How to run: repair what can be repaired, or only report. */
export interface DoctorOptions {
  /** Report only — never write. */
  readonly check?: boolean;
  /** How the caller reaches `doctor`, used in the report's fix line. */
  readonly invocation?: string | undefined;
}

/** Directory the package ships its skills in. Absent in a compiled binary. */
export const shippedSkillsDir = (path: Path.Path): string =>
  path.join(path.resolve(import.meta.dirname, '..', '..', '..'), 'skills');

/** Directory `doctor` installs one skill into. */
export const installedSkillDir = (path: Path.Path, root: string, name: string): string =>
  path.join(root, '.agents', 'skills', name);

/** The manifest entry for one skill. */
const entryOf = (name: string): PayloadEntry => ({
  kind: 'skill',
  name,
  source: `skills/${name}`,
  target: `.agents/skills/${name}`,
});

/** Every payload this package ships, as the generated embed type. */
export const embeddedPayloads = (): EmbeddedPayload => EMBEDDED_PAYLOAD;

/**
 * Resolve one skill's payload, preferring the package directory and falling
 * back to the embedded copy for a compiled binary.
 * @param fs - filesystem service
 * @param path - path service
 * @param name - skill name
 * @param shippedDir - the package `skills/` directory, which may not exist
 * @returns the payload and its origin, or undefined when it is unavailable
 */
export const readPayload = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  name: string,
  shippedDir: string,
): Effect.Effect<
  | { readonly files: SkillPayload; readonly origin: PayloadOrigin; readonly source: string }
  | undefined
> => resolveSharedPayload(fs, path, path.dirname(shippedDir), entryOf(name), EMBEDDED_PAYLOAD);

/**
 * Check every shipped skill under `<root>/.agents/skills/` and, unless `check`
 * is set, rewrite the copies that are missing, stale, or holding a different
 * file set. Idempotent: a current skill is never rewritten.
 * @param root - repo root that owns `.agents/skills/`
 * @param options - set `check` to report without writing
 * @returns per-skill outcomes, the aggregate status, and a one-line message
 */
export const runDoctor = (root: string, options: DoctorOptions = {}): Effect.Effect<DoctorResult> =>
  runPayloadDoctor(root, MANIFEST, {
    check: options.check === true,
    packageRoot: `${import.meta.dirname}/../../..`,
    embedded: EMBEDDED_PAYLOAD,
    invocation: options.invocation ?? DEFAULT_DOCTOR_INVOCATION,
    subject: 'skills',
  });

/**
 * Human-readable doctor summary: one line per skill.
 * @param result - result from {@link runDoctor}
 * @returns newline-joined per-skill lines
 */
export const doctorMessage = (result: DoctorResult): string => result.message;
