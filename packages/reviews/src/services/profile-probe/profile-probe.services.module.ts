import { Context, Effect, Layer } from 'effect';
// eslint-disable-next-line montflow/no-node-platform-imports -- composition-root shell-out to the optional profiles CLI; a review must still verify when that extension is absent, so this stays a loose call rather than a package dependency.
import { execFile } from 'node:child_process';

/**
 * Outcome of asking the profiles extension to verify one profile.
 *
 * `unavailable` is not a failure — it means the extension is not installed,
 * which callers report as a warning rather than an issue so a review still
 * verifies on a machine that has no profiles tooling.
 */
export type ProbeOutcome =
  | { readonly kind: 'passed' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'unavailable'; readonly message: string };

/** Default binary: the `mf-profiles` bin the `@montflow/profiles` package installs. */
export const DEFAULT_BIN = 'mf-profiles';

/** How long one probe may run before it is treated as failed. */
const TIMEOUT_MS = 30_000;

/**
 * Run `mf-profiles verify <name> --dir <cwd>` and reduce it to a
 * {@link ProbeOutcome}. Never rejects: a missing binary is `unavailable`; any
 * other non-zero exit is `failed` with the captured output as its message.
 */
const runProbe = (bin: string, name: string, cwd: string): Promise<ProbeOutcome> =>
  new Promise((resolve) => {
    execFile(
      bin,
      ['verify', name, '--dir', cwd],
      { timeout: TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ kind: 'passed' });
          return;
        }
        if (error.code === 'ENOENT' || error.code === 'EACCES') {
          resolve({
            kind: 'unavailable',
            message: `Profiles extension ('${bin}') is not installed — skipped verifying profile '${name}'.`,
          });
          return;
        }
        const detail = `${stderr}${stdout}`.trim() || error.message;
        resolve({ kind: 'failed', message: detail });
      },
    );
  });

/** Profile-verification surface the review engines consume. */
export interface Impl {
  /** Ask the profiles extension to verify one profile in `cwd`. Never fails. */
  readonly verify: (name: string, cwd: string) => Effect.Effect<ProbeOutcome>;
}

/** Build the probe over a specific binary. */
const make = (bin: string): Effect.Effect<Impl> =>
  Effect.sync(() => ({
    verify: (name, cwd) => Effect.promise(() => runProbe(bin, name, cwd)),
  }));

export const Id = '@montflow/ProfileProbe';
export type Id = typeof Id;

/** Optional profile-verification probe over the profiles extension. */
export class ProfileProbe extends Context.Service<ProfileProbe, Impl>()(Id) {}

/** Probe layer over an explicit binary, for overrides and tests. */
export const layer = (bin: string): Layer.Layer<ProfileProbe> =>
  Layer.effect(ProfileProbe, make(bin));

/** Default probe over the `mf-profiles` bin. */
export const Default: Layer.Layer<ProfileProbe> = layer(DEFAULT_BIN);
