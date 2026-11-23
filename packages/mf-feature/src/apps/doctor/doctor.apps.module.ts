import { Effect } from 'effect';
import {
  type LoadedManifest,
  type PayloadDoctorResult,
  type PayloadInstall,
  loadManifest,
  namesOf,
  runPayloadDoctor,
} from '@montflow/payload';
import { EMBEDDED_PAYLOAD } from './embedded-payload.generated.js';
import manifestJson from '../../../payload.json' with { type: 'json' };

/**
 * `mf-feature doctor`: install or check what mf-feature ships into a workspace: the
 * `mf-feature` and `mf-feature-*` skills (`.agents/skills/`) and the
 * `mf-feature-generic-worker` and `mf-feature-comment-sicko` profiles
 * (`.agents/@montflow/profiles/`).
 *
 * Skills and profiles the package does not ship are user data: doctor never
 * reads, rewrites, or deletes them. The roles file is never touched.
 */

/** The validated manifest this package ships. */
export const MANIFEST: LoadedManifest = loadManifest(manifestJson, '@montflow/feature');

export const SKILL_NAMES: ReadonlyArray<string> = namesOf(MANIFEST, 'skill');
export const PROFILE_NAMES: ReadonlyArray<string> = namesOf(MANIFEST, 'profile');

export const DEFAULT_DOCTOR_INVOCATION = 'mf-feature doctor';

export interface DoctorResult {
  readonly status: PayloadDoctorResult['status'];
  readonly healthy: boolean;
  readonly installs: ReadonlyArray<PayloadInstall>;
  readonly message: string;
}

export interface DoctorOptions {
  /** Report only — never write. */
  readonly check?: boolean;
  /** How the caller reaches `doctor`, used in the report's fix line. */
  readonly invocation?: string | undefined;
}

/**
 * Check every shipped skill and profile and, unless `check` is set, rewrite
 * the copies that are missing or stale. Idempotent.
 * @param root - workspace root
 * @param options - set `check` to report without writing
 * @returns per-artifact outcomes, the aggregate status, and a one-line message
 */
export const runDoctor = (root: string, options: DoctorOptions = {}): Effect.Effect<DoctorResult> =>
  runPayloadDoctor(root, MANIFEST, {
    check: options.check === true,
    packageRoot: `${import.meta.dirname}/../../..`,
    embedded: EMBEDDED_PAYLOAD,
    invocation: options.invocation ?? DEFAULT_DOCTOR_INVOCATION,
    subject: 'mf-feature skills and profiles',
  }).pipe(
    Effect.map((result) => ({
      status: result.status,
      healthy: result.healthy,
      installs: result.payloads,
      message: result.message,
    })),
  );
