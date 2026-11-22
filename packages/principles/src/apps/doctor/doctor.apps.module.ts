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
 * `mf-principles doctor`: check `<root>/.agents/@montflow/principles/` against
 * the principles this package ships, and repair what it can.
 *
 * Principles the package does not ship are user data: doctor never reads,
 * rewrites, or deletes them.
 */

/** The validated manifest this package ships. */
export const MANIFEST: LoadedManifest = loadManifest(manifestJson, '@montflow/principles');

/** Principles shipped with the package and installed into a workspace. */
export const PRINCIPLE_NAMES: ReadonlyArray<string> = namesOf(MANIFEST, 'principle');

/** The default way a caller reaches `doctor` when it does not say. */
export const DEFAULT_DOCTOR_INVOCATION = 'mf-principles doctor';

/** Outcome of a doctor run across every shipped principle. */
export interface DoctorResult {
  readonly status: PayloadDoctorResult['status'];
  readonly healthy: boolean;
  readonly principles: ReadonlyArray<PayloadInstall>;
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
 * Check every shipped principle under `<root>/.agents/@montflow/principles/`
 * and, unless `check` is set, rewrite the copies that are missing, stale, or
 * holding a different file set. Idempotent: a current principle is never
 * rewritten, and an unlisted principle is never touched.
 * @param root - workspace root that owns `.agents/@montflow/principles/`
 * @param options - set `check` to report without writing
 * @returns per-principle outcomes, the aggregate status, and a one-line message
 */
export const runDoctor = (root: string, options: DoctorOptions = {}): Effect.Effect<DoctorResult> =>
  runPayloadDoctor(root, MANIFEST, {
    check: options.check === true,
    packageRoot: `${import.meta.dirname}/../../..`,
    embedded: EMBEDDED_PAYLOAD,
    invocation: options.invocation ?? DEFAULT_DOCTOR_INVOCATION,
    subject: 'principles',
  });
