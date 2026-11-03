import { Effect } from 'effect';
import {
  type LoadedManifest,
  type PayloadInstall,
  type PayloadDoctorResult,
  loadManifest,
  nameAt,
  runPayloadDoctor,
} from '@montflow/payload';
import { EMBEDDED_PAYLOAD } from './embedded-payload.generated.js';
import manifestJson from '../../../payload.json' with { type: 'json' };

/**
 * `mf-profiles doctor` — the binary, and the `/mf-profiles-cli doctor` slash
 * command: check `<root>/.agents/@montflow/profiles/` against the profiles this
 * package ships, and repair what it can.
 *
 * Profiles the package does not ship are user data: doctor never reads,
 * rewrites, or deletes them.
 */

/** The validated manifest this package ships. */
export const MANIFEST: LoadedManifest = loadManifest(manifestJson, '@montflow/profiles');

/** Profiles shipped with the package and installed into a workspace. */
export const PROFILE_NAMES = [
  nameAt(MANIFEST, 'profile', 0),
  nameAt(MANIFEST, 'profile', 1),
  nameAt(MANIFEST, 'profile', 2),
  nameAt(MANIFEST, 'profile', 3),
  nameAt(MANIFEST, 'profile', 4),
  nameAt(MANIFEST, 'profile', 5),
] as const;

/** The default way a caller reaches `doctor` when it does not say. */
export const DEFAULT_DOCTOR_INVOCATION = '/mf-profiles-cli doctor';

/** Outcome for one shipped profile. */
export type ProfileStatus = PayloadInstall;

/** Outcome of a doctor run across every shipped profile. */
export interface DoctorResult {
  readonly status: PayloadDoctorResult['status'];
  readonly healthy: boolean;
  readonly profiles: ReadonlyArray<PayloadInstall>;
  readonly message: string;
}

/** How to run: repair what can be repaired, or only report. */
export interface DoctorOptions {
  /** Report only — never write. */
  readonly check?: boolean;
  /** How the caller reaches `doctor`, used in the report's fix line. */
  readonly invocation?: string | undefined;
}

/**
 * Check every shipped profile under `<root>/.agents/@montflow/profiles/` and,
 * unless `check` is set, rewrite the copies that are missing, stale, or
 * holding a different file set. Idempotent: a current profile is never
 * rewritten, and an unlisted profile is never touched.
 * @param root - workspace root that owns `.agents/@montflow/profiles/`
 * @param options - set `check` to report without writing
 * @returns per-profile outcomes, the aggregate status, and a one-line message
 */
export const runDoctor = (root: string, options: DoctorOptions = {}): Effect.Effect<DoctorResult> =>
  runPayloadDoctor(root, MANIFEST, {
    check: options.check === true,
    packageRoot: `${import.meta.dirname}/../../..`,
    embedded: EMBEDDED_PAYLOAD,
    invocation: options.invocation ?? DEFAULT_DOCTOR_INVOCATION,
    subject: 'profiles',
  });

/**
 * Human-readable doctor summary: one line per profile.
 * @param result - result from {@link runDoctor}
 * @returns newline-joined per-profile lines
 */
export const doctorMessage = (result: DoctorResult): string => result.message;
