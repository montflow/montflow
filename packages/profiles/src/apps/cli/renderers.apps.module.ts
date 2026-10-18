import * as PiProfiles from '../../modules/pi-profiles/index.js';
import type { ProfileListEntry, ProfileVerifyReport } from './engines.apps.module.js';

/**
 * Pure `data -> text` renderers for the profiles store. No Effect, no I/O:
 * the slash command notifies what these return, the `mf-profiles` binary
 * prints it, so the two surfaces cannot disagree about output. Failures are
 * never suppressed; passing items appear only under `verbose`.
 */

/** A ` (N warning[s])` marker, or nothing when the entry carries none. */
const warningMarker = (count: number): string =>
  count === 0 ? '' : ` (${count} warning${count === 1 ? '' : 's'})`;

/**
 * Render the profile list, or a hint when the store is empty. An entry whose
 * only findings are advisory carries a warning marker, so `list --status valid`
 * cannot present a warning-bearing profile as indistinguishable from a clean one.
 */
export const list = (entries: ReadonlyArray<ProfileListEntry>): string =>
  entries.length === 0
    ? 'No profiles yet — create one with `/mf-profiles create <name>`.'
    : entries
        .map(
          ({ profile, warningCount }) =>
            `• ${profile.name} — ${profile.description}${warningMarker(warningCount)}`,
        )
        .join('\n');

/** Render one profile: description, model, skills, instructions, checklist. */
export const show = (profile: PiProfiles.Profile): string => {
  const header =
    profile.description === '' ? profile.name : `${profile.name} — ${profile.description}`;
  const meta = [
    profile.model === '' ? null : `model: ${profile.model}`,
    profile.skills.length === 0 ? null : `skills: ${profile.skills.join(', ')}`,
  ].filter((line): line is string => line !== null);
  const checklist =
    profile.checklist.length === 0
      ? ''
      : `\n\nReview checklist:\n${profile.checklist.map((item) => `- [ ] ${item}`).join('\n')}`;
  const instructions = profile.instructions === '' ? '(no instructions yet)' : profile.instructions;
  return `${header}${meta.length > 0 ? `\n${meta.join('\n')}` : ''}\n\n${instructions}${checklist}`;
};

/** Render a save confirmation (also used after a create). */
export const saved = (profile: PiProfiles.Profile): string => `Saved profile '${profile.name}'.`;

/** Render a delete confirmation. */
export const deleted = (name: string): string => `Deleted profile '${name}'.`;

/** Render one profile's verification outcome: a line when clean, findings otherwise. */
export const verify = (name: string, result: PiProfiles.VerifyResult): string => {
  if (result.issues.length === 0) return `✓ '${name}' matches the standard format.`;
  const errors = PiProfiles.errorCount(result.issues);
  const warnings = PiProfiles.warningCount(result.issues);
  const warningClause = warnings === 0 ? '' : ` · ${warnings} warning${warnings === 1 ? '' : 's'}`;
  const header = result.valid
    ? `✓ '${name}' matches the standard format — ${warnings} warning${warnings === 1 ? '' : 's'}:`
    : `✗ '${name}' has ${errors} issue${errors === 1 ? '' : 's'}${warningClause}:`;
  const findings = result.issues.map((found) => `• [${found.field}] ${found.message}`).join('\n');
  return `${header}\n${findings}`;
};

/**
 * Render a whole-store verification report. Failures are never suppressed; a
 * profile with no findings appears only under `verbose`, while one carrying
 * warnings is always shown. The summary counts errors and warnings apart.
 */
export const renderVerifyAll = (report: ProfileVerifyReport, verbose = false): string => {
  const lines: Array<string> = [];
  for (const entry of report.entries) {
    if (entry.result.valid && entry.result.issues.length === 0 && !verbose) continue;
    lines.push(`${entry.name}: ${PiProfiles.verifyInfoLine(entry.result)}`);
    for (const issue of entry.result.issues) lines.push(`  ${issue.field}: ${issue.message}`);
  }
  if (report.entries.length === 0) lines.push('No profiles.');
  const profiles = report.entries.length;
  lines.push(
    `${profiles} profile${profiles === 1 ? '' : 's'} \u00b7 ${report.issueCount} issue${report.issueCount === 1 ? '' : 's'} \u00b7 ${report.warningCount} warning${report.warningCount === 1 ? '' : 's'}`,
  );
  for (const warning of report.warnings) lines.push(`! ${warning}`);
  return lines.join('\n');
};
