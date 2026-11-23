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
} from '@montflow/payload';
import { EMBEDDED_PAYLOAD } from './embedded-payload.generated.js';
import manifestJson from '../../../payload.json' with { type: 'json' };

/**
 * `mf-reviews doctor` — check `<root>/.agents/skills/` against the skills this
 * package ships, and repair what it can. A stale `SKILL.md` teaches an agent
 * rules the verifier no longer enforces, which fails later and further from
 * the cause.
 */

/** The validated manifest this package ships. */
export const MANIFEST: LoadedManifest = loadManifest(manifestJson, '@montflow/reviews');

/** Skills shipped with the package and installed into a repo. */
export const SKILL_NAMES = [nameAt(MANIFEST, 'skill', 0), nameAt(MANIFEST, 'skill', 1)] as const;

/** The default way a caller reaches `doctor` when it does not say. */
export const DEFAULT_DOCTOR_INVOCATION = '/mf-reviews doctor';

/** Outcome for one shipped skill. */
export type SkillStatus = PayloadInstall;

/** A skill's packaged files, as filename → contents. */
export type SkillPayload = PayloadFiles;

/** Where a resolved payload came from. */
export type PayloadOrigin = 'package' | 'embedded';

/** Outcome of a doctor run across every shipped skill. */
export interface DoctorResult {
  readonly status: PayloadDoctorResult['status'];
  readonly healthy: boolean;
  readonly skills: ReadonlyArray<PayloadInstall>;
  readonly message: string;
}

/** How to run: repair what can be repaired, or only report. */
export interface DoctorOptions {
  readonly check?: boolean;
  readonly invocation?: string | undefined;
}

/** Directory the package ships its skills in. Absent in a compiled binary. */
export const shippedSkillsDir = (path: Path.Path): string =>
  path.join(`${import.meta.dirname}/../../..`, 'skills');

/** Directory `doctor` installs one skill into. */
export const installedSkillDir = (path: Path.Path, root: string, name: string): string =>
  path.join(root, '.agents', 'skills', name);

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
> =>
  resolveSharedPayload(
    fs,
    path,
    path.dirname(shippedDir),
    {
      kind: 'skill',
      name,
      source: `skills/${name}`,
      target: `.agents/skills/${name}`,
    } satisfies PayloadEntry,
    EMBEDDED_PAYLOAD,
  );

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
    subject: 'review skills',
  });

/**
 * Human-readable doctor summary: one line per skill.
 * @param result - result from {@link runDoctor}
 * @returns newline-joined per-skill lines
 */
export const doctorMessage = (result: DoctorResult): string => result.message;

/**
 * The short message an execution stops on. Deliberately terse: it is a gate,
 * not a report, and the full `doctor` output is one command away.
 * @param result - result from a `check`-mode {@link runDoctor}
 * @param invocation - how the caller reaches `doctor`, so the advice is typeable
 * @returns one or two lines naming what is wrong and the fix
 */
export const doctorGateMessage = (
  result: {
    readonly skills: ReadonlyArray<PayloadInstall>;
    readonly status?: PayloadDoctorResult['status'];
    readonly healthy?: boolean;
    readonly message?: string;
  },
  invocation = DEFAULT_DOCTOR_INVOCATION,
): string => {
  const broken = result.skills.filter(
    (skill) =>
      skill.status === 'missing' ||
      skill.status === 'stale' ||
      skill.status === 'mismatched' ||
      skill.status === 'blocked',
  );
  return [
    `Review skills are not ready: ${broken.map((skill) => `${skill.name} (${skill.detail ?? skill.status})`).join('; ')}.`,
    `Run \`${invocation}\` to repair, then retry.`,
  ].join('\n');
};
