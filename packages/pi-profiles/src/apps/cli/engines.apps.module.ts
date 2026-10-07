import { Effect } from 'effect';
import * as PiProfiles from '../../modules/pi-profiles/index.js';
import { ProfileStore } from '../../services/index.js';

/**
 * Headless verification engine for the profiles store.
 *
 * The `/mf-profiles-cli verify <name>` action only verifies one profile and
 * needs a Pi session. This module verifies the whole store as a plain Effect
 * so the binary (and the CI gate) can run it with no session. It reads the
 * raw files directly rather than going through `ProfileStore.list`, which
 * silently drops any file it cannot decode.
 */

/** One profile's verification result, paired with its name. */
export interface ProfileVerifyEntry {
  readonly name: string;
  readonly result: PiProfiles.VerifyResult;
}

/** A whole-store verification report. */
export interface ProfileVerifyReport {
  readonly entries: ReadonlyArray<ProfileVerifyEntry>;
  readonly issueCount: number;
}

/**
 * Mechanically verify every profile file under `<cwd>/.agents/@montflow/profiles`,
 * including files the store cannot decode.
 */
export const verifyAll = (
  cwd: string,
): Effect.Effect<ProfileVerifyReport, string, ProfileStore.ProfileStore> =>
  Effect.gen(function* () {
    const store = yield* ProfileStore.ProfileStore;
    const raws = yield* store
      .readAllRaw(cwd)
      .pipe(Effect.mapError((error: ProfileStore.StoreError) => error.message));
    const entries = raws.map(({ name, raw }) => ({
      name,
      result: PiProfiles.verifyProfileFile(name, raw),
    }));
    const issueCount = entries.reduce((count, entry) => count + entry.result.issues.length, 0);
    return { entries, issueCount };
  });

/**
 * Render a whole-store report. Failures are never suppressed; a passing
 * profile appears only under `verbose`, matching the single-profile renderer.
 */
export const renderVerifyAll = (report: ProfileVerifyReport, verbose = false): string => {
  const lines: Array<string> = [];
  for (const entry of report.entries) {
    if (entry.result.valid && !verbose) continue;
    lines.push(`${entry.name}: ${PiProfiles.verifyInfoLine(entry.result)}`);
    for (const issue of entry.result.issues) lines.push(`  ${issue.field}: ${issue.message}`);
  }
  if (report.entries.length === 0) lines.push('No profiles.');
  lines.push(
    `${report.entries.length} profile${report.entries.length === 1 ? '' : 's'} \u00b7 ${report.issueCount} issue${report.issueCount === 1 ? '' : 's'}`,
  );
  return lines.join('\n');
};
